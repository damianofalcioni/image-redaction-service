import { z } from 'zod';

const imageOutputTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];

export const regionSchema = z.object({
  x: z.number().finite().min(0).max(1).describe('Normalized left coordinate: left / imageWidth.'),
  y: z.number().finite().min(0).max(1).describe('Normalized top coordinate: top / imageHeight.'),
  width: z.number().finite().positive().max(1).describe('Normalized region width: regionWidth / imageWidth.'),
  height: z.number().finite().positive().max(1).describe('Normalized region height: regionHeight / imageHeight.'),
  paddingPixels: z.number().int().min(0).max(500).optional().describe('Optional pixel padding added around this region.'),
  blurRadius: z.number().finite().min(0.3).max(100).optional().describe('Optional blur radius for this region only.')
});

export const fetchHeadersSchema = z.record(z.string(), z.string()).optional().describe(
  'Restricted remote-fetch headers. Only Authorization, Accept, and User-Agent are accepted.'
);

export const blurOptionsSchema = z.object({
  blurRadius: z.number().finite().min(0.3).max(100).optional().describe('Default blur radius for all regions.'),
  outputType: z.enum(imageOutputTypes).optional().describe('Output MIME type.'),
  quality: z.number().int().min(1).max(100).optional().describe('JPEG, WebP, or AVIF quality.'),
  returnDataUrl: z.boolean().optional().describe('When true, structuredContent.image is a data URL; otherwise raw base64.'),
  inputMimeType: z.string().optional().describe('Fallback input MIME type for raw base64 or Buffer sources.'),
  regionPaddingPixels: z.number().int().min(0).max(500).optional().describe('Default pixel padding added around all regions.'),
  fetchHeaders: fetchHeadersSchema
});

export const blurToolInputSchema = {
  imageSource: z.string().describe('Raw base64 image, data URL, or HTTP/HTTPS URL when remote fetching is enabled.'),
  regions: z.array(regionSchema).min(1).describe('Sensitive regions to blur, using normalized coordinates.'),
  options: blurOptionsSchema.optional().describe('Optional processing options.')
};

export const batchBlurToolInputSchema = {
  images: z.array(z.object({
    id: z.string().optional().describe('Optional caller-defined identifier returned with this image.'),
    imageSource: z.string().describe('Raw base64 image, data URL, or HTTP/HTTPS URL when enabled.'),
    regions: z.array(regionSchema).min(1).describe('Sensitive regions for this image.'),
    options: blurOptionsSchema.optional().describe('Optional processing options for this image.')
  })).min(1).describe('Images to redact concurrently while preserving input order.')
};

export const pdfToJpegToolInputSchema = {
  pdfSource: z.string().describe('Raw base64 PDF, PDF data URL, or HTTP/HTTPS URL when remote PDF fetching is enabled.'),
  options: z.object({
    quality: z.number().int().min(1).max(100).optional().describe('JPEG quality.'),
    scale: z.number().finite().min(0.1).max(4).optional().describe('Rendering scale applied to each PDF page.'),
    returnDataUrl: z.boolean().optional().describe('When true, page images are data URLs; otherwise raw base64.'),
    fetchHeaders: fetchHeadersSchema
  }).optional().describe('Optional PDF rendering options.')
};
