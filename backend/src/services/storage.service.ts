/**
 * R2 Storage Service
 *
 * Provides file upload, download, delete, and presigned URL generation
 * using Cloudflare R2 (S3-compatible) via @aws-sdk/client-s3.
 *
 * Environment variables:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 API access key ID
 * - R2_SECRET_ACCESS_KEY: R2 API secret access key
 * - R2_BUCKET_NAME: Target R2 bucket name
 *
 * Validates: Requirements 11.4
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

/**
 * Load storage configuration from environment variables.
 * Throws if any required variable is missing.
 */
export function loadStorageConfig(): StorageConfig {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId) throw new Error('R2_ACCOUNT_ID environment variable is required');
  if (!accessKeyId) throw new Error('R2_ACCESS_KEY_ID environment variable is required');
  if (!secretAccessKey) throw new Error('R2_SECRET_ACCESS_KEY environment variable is required');
  if (!bucketName) throw new Error('R2_BUCKET_NAME environment variable is required');

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

/**
 * Create an S3Client configured for Cloudflare R2.
 */
export function createR2Client(config: StorageConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

// ─── Storage Service ─────────────────────────────────────────────────────────

export interface UploadResult {
  key: string;
  bucket: string;
}

export interface DownloadResult {
  body: Buffer;
  contentType?: string;
}

export class StorageService {
  private client: S3Client;
  private bucketName: string;

  constructor(client: S3Client, bucketName: string) {
    this.client = client;
    this.bucketName = bucketName;
  }

  /**
   * Create a StorageService from environment variables.
   */
  static fromEnv(): StorageService {
    const config = loadStorageConfig();
    const client = createR2Client(config);
    return new StorageService(client, config.bucketName);
  }

  /**
   * Upload a file to R2.
   *
   * @param key - The object key (path) in the bucket
   * @param body - The file content as a Buffer
   * @param contentType - Optional MIME type (defaults to application/octet-stream)
   * @returns Upload result with key and bucket name
   */
  async upload(key: string, body: Buffer, contentType?: string): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType ?? 'application/octet-stream',
    });

    await this.client.send(command);

    return { key, bucket: this.bucketName };
  }

  /**
   * Download a file from R2.
   *
   * @param key - The object key (path) in the bucket
   * @returns The file content as a Buffer and optional content type
   */
  async download(key: string): Promise<DownloadResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Empty response body for key: ${key}`);
    }

    // Convert the readable stream to a Buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    return {
      body,
      contentType: response.ContentType,
    };
  }

  /**
   * Delete a file from R2.
   *
   * @param key - The object key (path) in the bucket
   */
  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Generate a presigned URL for downloading a file from R2.
   *
   * @param key - The object key (path) in the bucket
   * @param expiresInSeconds - URL expiration time in seconds (default: 3600 = 1 hour)
   * @returns A presigned URL string
   */
  async generatePresignedUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }
}
