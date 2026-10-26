import type { ImageUploadResponse } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

/**
 * Upload an image file to a course
 */
export async function uploadImage(
  courseId: string,
  file: File
): Promise<ImageUploadResponse> {
  const token = localStorage.getItem('token');

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}/uploads/images/${courseId}`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to upload image');
  }

  return response.json();
}

/**
 * Upload an image from a URL to a course
 */
export async function uploadImageFromUrl(
  _courseId: string,
  url: string
): Promise<ImageUploadResponse> {
  // A remote reference is rendered only by the browser, without app credentials.
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Use an HTTP(S) image URL without credentials, or upload a raster file.');
  }
  return { url: parsed.href, filename: parsed.pathname.split('/').pop() || 'remote-image' };
}

/**
 * Get the full URL for a course image
 */
export function getImageUrl(courseId: string, filename: string): string {
  return `${BASE_URL}/uploads/courses/${courseId}/images/${filename}`;
}

export const uploadsApi = {
  uploadImage,
  uploadImageFromUrl,
  getImageUrl,
};
