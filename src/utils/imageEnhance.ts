import sharp from 'sharp';

// GIFs (possibly animated) aren't safe to run through sharp's raster pipeline here.
const ENHANCEABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const enhanceCardImage = async (buffer: Buffer, mimeType: string): Promise<Buffer> => {
  if (!ENHANCEABLE_TYPES.includes(mimeType)) return buffer;

  try {
    // Plain brightness multiply, not .normalize(): normalize() stretches contrast off the
    // image's global min/max, so a card with any bright highlight (chip, hologram, white text)
    // anchors "max" and everything else gets stretched darker instead of brighter.
    return await sharp(buffer)
      .rotate() // apply EXIF orientation so the crop the user made stays correct
      .modulate({ brightness: 1.1 })
      .toBuffer();
  } catch {
    return buffer;
  }
};
