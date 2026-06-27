import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService, loadStorageConfig, createR2Client } from './storage.service.js';

// Mock the AWS SDK modules
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn((input) => ({ input, _type: 'PutObject' })),
    GetObjectCommand: vi.fn((input) => ({ input, _type: 'GetObject' })),
    DeleteObjectCommand: vi.fn((input) => ({ input, _type: 'DeleteObject' })),
    __mockSend: mockSend,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

// Import mocked modules to access mock functions
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('StorageService', () => {
  let service: StorageService;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get the mock send function from the mocked S3Client instance
    const clientInstance = new S3Client({});
    mockSend = clientInstance.send as ReturnType<typeof vi.fn>;

    service = new StorageService(clientInstance, 'test-bucket');
  });

  describe('upload', () => {
    it('uploads a file with the specified key and body', async () => {
      mockSend.mockResolvedValueOnce({});

      const body = Buffer.from('hello world');
      const result = await service.upload('test/file.txt', body, 'text/plain');

      expect(result).toEqual({ key: 'test/file.txt', bucket: 'test-bucket' });
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test/file.txt',
        Body: body,
        ContentType: 'text/plain',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('uses application/octet-stream as default content type', async () => {
      mockSend.mockResolvedValueOnce({});

      const body = Buffer.from('binary data');
      await service.upload('data/binary.bin', body);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'data/binary.bin',
        Body: body,
        ContentType: 'application/octet-stream',
      });
    });

    it('propagates S3 client errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access Denied'));

      const body = Buffer.from('data');
      await expect(service.upload('key', body)).rejects.toThrow('Access Denied');
    });
  });

  describe('download', () => {
    it('downloads a file and returns it as a Buffer', async () => {
      const content = Buffer.from('file content');
      const mockStream = (async function* () {
        yield content;
      })();

      mockSend.mockResolvedValueOnce({
        Body: mockStream,
        ContentType: 'text/plain',
      });

      const result = await service.download('test/file.txt');

      expect(result.body).toEqual(content);
      expect(result.contentType).toBe('text/plain');
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test/file.txt',
      });
    });

    it('handles multi-chunk responses', async () => {
      const chunk1 = Buffer.from('hello ');
      const chunk2 = Buffer.from('world');
      const mockStream = (async function* () {
        yield chunk1;
        yield chunk2;
      })();

      mockSend.mockResolvedValueOnce({
        Body: mockStream,
        ContentType: 'application/octet-stream',
      });

      const result = await service.download('multi-chunk.bin');

      expect(result.body).toEqual(Buffer.concat([chunk1, chunk2]));
    });

    it('throws when response body is empty', async () => {
      mockSend.mockResolvedValueOnce({
        Body: null,
        ContentType: 'text/plain',
      });

      await expect(service.download('missing.txt')).rejects.toThrow(
        'Empty response body for key: missing.txt'
      );
    });

    it('propagates S3 client errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));

      await expect(service.download('nonexistent.txt')).rejects.toThrow('NoSuchKey');
    });
  });

  describe('deleteObject', () => {
    it('deletes a file by key', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.deleteObject('test/file.txt');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test/file.txt',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('propagates S3 client errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access Denied'));

      await expect(service.deleteObject('protected.txt')).rejects.toThrow('Access Denied');
    });
  });

  describe('generatePresignedUrl', () => {
    it('generates a presigned URL with default expiry (1 hour)', async () => {
      const mockUrl = 'https://bucket.r2.cloudflarestorage.com/test/file.txt?X-Amz-Signature=abc';
      vi.mocked(getSignedUrl).mockResolvedValueOnce(mockUrl);

      const url = await service.generatePresignedUrl('test/file.txt');

      expect(url).toBe(mockUrl);
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'test/file.txt',
      });
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
    });

    it('generates a presigned URL with custom expiry', async () => {
      const mockUrl = 'https://bucket.r2.cloudflarestorage.com/file.txt?sig=xyz';
      vi.mocked(getSignedUrl).mockResolvedValueOnce(mockUrl);

      const url = await service.generatePresignedUrl('file.txt', 600);

      expect(url).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 600 }
      );
    });

    it('propagates presigner errors', async () => {
      vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error('Signing failed'));

      await expect(service.generatePresignedUrl('key')).rejects.toThrow('Signing failed');
    });
  });
});

describe('loadStorageConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads configuration from environment variables', () => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';

    const config = loadStorageConfig();

    expect(config).toEqual({
      accountId: 'test-account',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucketName: 'test-bucket',
    });
  });

  it('throws when R2_ACCOUNT_ID is missing', () => {
    delete process.env.R2_ACCOUNT_ID;
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET_NAME = 'bucket';

    expect(() => loadStorageConfig()).toThrow('R2_ACCOUNT_ID environment variable is required');
  });

  it('throws when R2_ACCESS_KEY_ID is missing', () => {
    process.env.R2_ACCOUNT_ID = 'account';
    delete process.env.R2_ACCESS_KEY_ID;
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET_NAME = 'bucket';

    expect(() => loadStorageConfig()).toThrow('R2_ACCESS_KEY_ID environment variable is required');
  });

  it('throws when R2_SECRET_ACCESS_KEY is missing', () => {
    process.env.R2_ACCOUNT_ID = 'account';
    process.env.R2_ACCESS_KEY_ID = 'key';
    delete process.env.R2_SECRET_ACCESS_KEY;
    process.env.R2_BUCKET_NAME = 'bucket';

    expect(() => loadStorageConfig()).toThrow('R2_SECRET_ACCESS_KEY environment variable is required');
  });

  it('throws when R2_BUCKET_NAME is missing', () => {
    process.env.R2_ACCOUNT_ID = 'account';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    delete process.env.R2_BUCKET_NAME;

    expect(() => loadStorageConfig()).toThrow('R2_BUCKET_NAME environment variable is required');
  });
});

describe('createR2Client', () => {
  it('creates S3Client with correct R2 endpoint', () => {
    const config = {
      accountId: 'my-account',
      accessKeyId: 'my-key',
      secretAccessKey: 'my-secret',
      bucketName: 'my-bucket',
    };

    createR2Client(config);

    expect(S3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://my-account.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: 'my-key',
        secretAccessKey: 'my-secret',
      },
    });
  });
});
