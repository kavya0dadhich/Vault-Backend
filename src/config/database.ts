import dns from 'dns';
import mongoose from 'mongoose';

export const connectDatabase = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/document-vault';

  if (uri.startsWith('mongodb+srv://')) {
    // Node's DNS resolver fails SRV lookups against some network's link-local
    // IPv6 DNS server on Windows, even though the OS resolver handles it fine.
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log('MongoDB connected:', uri.replace(/:[^:@]+@/, ':****@'));
  } catch (error) {
    console.error('MongoDB connection error:', error);
    console.error('\nCheck that:');
    console.error('  - MONGODB_URI in backend/.env has the correct password (no <db_password> placeholder left)');
    console.error('  - Your current IP is allowed in Atlas → Network Access\n');
    process.exit(1);
  }
};
