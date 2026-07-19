import crypto from 'crypto';
import { Types } from 'mongoose';
import { FamilyLink, IFamilyLink } from '../models/FamilyLink';
import { User } from '../models/User';
import { Activity } from '../models/Activity';
import { AppError } from '../middleware/errorHandler';
import { sendMail } from './mailer.service';
import { createNotification } from './notification.service';
import * as fileService from './file.service';
import * as cardService from './card.service';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const generateOtp = (): string => crypto.randomInt(100000, 1000000).toString();
const hashOtp = (otp: string): string => crypto.createHash('sha256').update(otp).digest('hex');

const logActivity = async (
  userId: string,
  action: string,
  targetId: string,
  targetName: string,
  metadata?: Record<string, unknown>
) => {
  await Activity.create({ userId, action, targetType: 'family', targetId, targetName, metadata });
};

const emailOtp = async (memberEmail: string, memberFirstName: string, requesterName: string, otp: string) => {
  await sendMail({
    to: memberEmail,
    subject: `${requesterName} wants to add you as a family member on Document Vault`,
    html: `<p>Hi ${memberFirstName},</p>
      <p><strong>${requesterName}</strong> wants to link your Document Vault account so they can view your documents (read-only). This will not happen unless you approve it.</p>
      <p>Your one-time code is: <strong style="font-size:20px">${otp}</strong> (expires in 10 minutes)</p>
      <p>Only share this code with ${requesterName} if you want to grant them access. If you don't recognize this request, ignore this email and decline the request in the app.</p>`,
    fallbackLog: `Family link OTP for ${memberEmail}: ${otp} (requested by ${requesterName})`,
  });
};

export const sendFamilyRequest = async (requesterId: string, memberEmail: string) => {
  const requester = await User.findById(requesterId);
  if (!requester) throw new AppError('User not found', 404);

  const member = await User.findOne({ email: memberEmail.toLowerCase() });
  if (!member) throw new AppError('No Document Vault account found with that email', 404);
  if (member._id.toString() === requesterId) {
    throw new AppError('You cannot add yourself as a family member', 400);
  }

  const existing = await FamilyLink.findOne({
    requesterId,
    memberId: member._id,
    status: { $in: ['pending', 'approved'] },
  });
  if (existing) throw new AppError('A request already exists for this family member', 409);

  const otp = generateOtp();
  const link = await FamilyLink.create({
    requesterId,
    memberId: member._id,
    status: 'pending',
    otpHash: hashOtp(otp),
    otpExpires: new Date(Date.now() + OTP_TTL_MS),
    otpAttempts: 0,
  });

  const requesterName = `${requester.firstName} ${requester.lastName}`;
  await emailOtp(member.email, member.firstName, requesterName, otp);
  await createNotification(
    member._id,
    'family_request',
    `${requesterName} wants to add you as a family member`,
    'Approve or decline this request from your Family page. They will also need the one-time code we emailed you.',
    link._id
  );
  await logActivity(requesterId, 'family_request_sent', link._id.toString(), member.email);

  return sanitizeLink(link, member);
};

export const respondToFamilyRequest = async (
  memberId: string,
  linkId: string,
  decision: 'approve' | 'reject'
) => {
  const link = await FamilyLink.findOne({ _id: linkId, memberId, status: 'pending' });
  if (!link) throw new AppError('Request not found', 404);

  const requester = await User.findById(link.requesterId);

  if (decision === 'reject') {
    link.status = 'rejected';
    await link.save();
    if (requester) {
      await createNotification(
        requester._id,
        'family_rejected',
        'Family request declined',
        `Your family link request was declined.`,
        link._id
      );
    }
    await logActivity(memberId, 'family_request_rejected', link._id.toString(), requester?.email || '');
    return link;
  }

  link.memberApprovedAt = new Date();
  if (link.otpVerifiedAt) {
    link.status = 'approved';
  }
  await link.save();

  if (link.status === 'approved' && requester) {
    await createNotification(
      requester._id,
      'family_approved',
      'Family request approved',
      'You now have read-only access to their documents.',
      link._id
    );
  }
  await logActivity(memberId, 'family_request_approved', link._id.toString(), requester?.email || '');
  return link;
};

export const verifyFamilyOtp = async (requesterId: string, linkId: string, otp: string) => {
  const link = await FamilyLink.findOne({ _id: linkId, requesterId, status: 'pending' }).select(
    '+otpHash +otpExpires +otpAttempts'
  );
  if (!link) throw new AppError('Request not found', 404);

  // Already verified once — otpHash/otpExpires get cleared on the first
  // success, so a repeat submission (double-click, retry, etc.) would
  // otherwise look identical to a genuinely expired code. Treat it as a
  // no-op success instead of nuking the link to 'expired'.
  if (link.otpVerifiedAt) {
    return link;
  }

  if (!link.otpExpires || link.otpExpires < new Date()) {
    link.status = 'expired';
    await link.save();
    throw new AppError('Code expired. Please resend a new code.', 400);
  }
  if (link.otpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts. Please resend a new code.', 429);
  }
  if (hashOtp(otp) !== link.otpHash) {
    link.otpAttempts += 1;
    await link.save();
    throw new AppError('Incorrect code', 400);
  }

  link.otpVerifiedAt = new Date();
  link.otpHash = undefined;
  link.otpExpires = undefined;
  link.otpAttempts = 0;
  if (link.memberApprovedAt) {
    link.status = 'approved';
  }
  await link.save();

  if (link.status === 'approved') {
    const requester = await User.findById(requesterId);
    if (requester) {
      await createNotification(
        link.memberId,
        'family_approved',
        'Family link confirmed',
        `${requester.firstName} ${requester.lastName} now has read-only access to your documents.`,
        link._id
      );
    }
  }
  await logActivity(requesterId, 'family_otp_verified', link._id.toString(), link.memberId.toString());
  return link;
};

export const resendFamilyOtp = async (requesterId: string, linkId: string) => {
  const link = await FamilyLink.findOne({ _id: linkId, requesterId, status: 'pending' }).select('+otpExpires');
  if (!link) throw new AppError('Request not found', 404);

  const lastSentAt = link.otpExpires ? link.otpExpires.getTime() - OTP_TTL_MS : 0;
  if (Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
    throw new AppError('Please wait a moment before requesting another code', 429);
  }

  const [requester, member] = await Promise.all([User.findById(requesterId), User.findById(link.memberId)]);
  if (!requester || !member) throw new AppError('User not found', 404);

  const otp = generateOtp();
  link.otpHash = hashOtp(otp);
  link.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  link.otpAttempts = 0;
  await link.save();

  await emailOtp(member.email, member.firstName, `${requester.firstName} ${requester.lastName}`, otp);
  return { message: 'A new code has been sent' };
};

export const revokeFamilyLink = async (userId: string, linkId: string) => {
  const link = await FamilyLink.findOne({
    _id: linkId,
    $or: [{ requesterId: userId }, { memberId: userId }],
    status: { $in: ['pending', 'approved'] },
  });
  if (!link) throw new AppError('Family link not found', 404);

  const otherPartyId = link.requesterId.toString() === userId ? link.memberId : link.requesterId;

  link.status = 'revoked';
  link.revokedAt = new Date();
  link.revokedBy = new Types.ObjectId(userId);
  await link.save();

  await createNotification(
    otherPartyId,
    'family_revoked',
    'Family link removed',
    'A family vault link involving your account was removed.',
    link._id
  );
  await logActivity(userId, 'family_link_revoked', link._id.toString(), otherPartyId.toString());

  return { message: 'Family link removed' };
};

export const listFamilyLinks = async (userId: string) => {
  const [pendingIncoming, pendingOutgoing, viewableMembers, viewers] = await Promise.all([
    // Excludes links the member already approved — those are just waiting on
    // the requester to enter the OTP, not actionable by the member anymore.
    FamilyLink.find({ memberId: userId, status: 'pending', memberApprovedAt: { $exists: false } })
      .populate('requesterId', 'firstName lastName email avatar')
      .sort({ createdAt: -1 })
      .lean(),
    FamilyLink.find({ requesterId: userId, status: 'pending' })
      .populate('memberId', 'firstName lastName email avatar')
      .sort({ createdAt: -1 })
      .lean(),
    FamilyLink.find({ requesterId: userId, status: 'approved' })
      .populate('memberId', 'firstName lastName email avatar')
      .sort({ createdAt: -1 })
      .lean(),
    FamilyLink.find({ memberId: userId, status: 'approved' })
      .populate('requesterId', 'firstName lastName email avatar')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return { pendingIncoming, pendingOutgoing, viewableMembers, viewers };
};

// Every read into a family member's vault re-verifies the link is still
// approved at request time — access is never trusted from client state.
const assertApprovedLink = async (requesterId: string, linkId: string): Promise<IFamilyLink> => {
  const link = await FamilyLink.findOne({ _id: linkId, requesterId, status: 'approved' });
  if (!link) throw new AppError("You don't have access to this family member's vault", 403);
  return link;
};

export const getFamilyMemberFiles = async (
  requesterId: string,
  linkId: string,
  query: Parameters<typeof fileService.getFiles>[1]
) => {
  const link = await assertApprovedLink(requesterId, linkId);
  return fileService.getFiles(link.memberId.toString(), query);
};

export const searchFamilyMemberFiles = async (
  requesterId: string,
  linkId: string,
  params: Parameters<typeof fileService.searchFiles>[1]
) => {
  const link = await assertApprovedLink(requesterId, linkId);
  return fileService.searchFiles(link.memberId.toString(), params);
};

export const getFamilyMemberImages = async (requesterId: string, linkId: string, page: number, limit: number) => {
  const link = await assertApprovedLink(requesterId, linkId);
  return fileService.getImages(link.memberId.toString(), page, limit);
};

export const getFamilyMemberFile = async (requesterId: string, linkId: string, fileId: string) => {
  const link = await assertApprovedLink(requesterId, linkId);
  return fileService.getFileById(link.memberId.toString(), fileId);
};

export const getFamilyMemberFileDownload = async (requesterId: string, linkId: string, fileId: string) => {
  const link = await assertApprovedLink(requesterId, linkId);
  return fileService.getDownloadUrl(link.memberId.toString(), fileId);
};

export const getFamilyMemberFilePreview = async (requesterId: string, linkId: string, fileId: string) => {
  const link = await assertApprovedLink(requesterId, linkId);
  return fileService.getPreviewUrl(link.memberId.toString(), fileId);
};

// Used by the local-file-serving route, which is reached via a userId-in-URL
// (not a linkId), to extend its ownership check to an approved family link.
export const hasApprovedFamilyAccess = async (requesterId: string, targetUserId: string): Promise<boolean> => {
  const link = await FamilyLink.exists({ requesterId, memberId: targetUserId, status: 'approved' });
  return !!link;
};

export const getFamilyMemberCards = async (requesterId: string, linkId: string) => {
  const link = await assertApprovedLink(requesterId, linkId);
  return cardService.listCards(link.memberId.toString());
};

const sanitizeLink = (link: IFamilyLink, member: { firstName: string; lastName: string; email: string }) => ({
  _id: link._id,
  status: link.status,
  createdAt: link.createdAt,
  member: { firstName: member.firstName, lastName: member.lastName, email: member.email },
});
