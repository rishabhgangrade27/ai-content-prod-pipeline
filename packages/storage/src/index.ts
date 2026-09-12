import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export interface UploadResult {
  key: string;
  url: string;
}

/**
 * Thin wrapper over an S3-compatible object store. Points at MinIO locally
 * (S3_ENDPOINT set, path-style addressing) and at real AWS S3 in production
 * (S3_ENDPOINT unset, virtual-hosted addressing) with no code change.
 */
export class ObjectStorage {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    this.bucket = process.env.MINIO_BUCKET ?? "pipeline-assets";
    this.publicBaseUrl = endpoint ? `${endpoint}/${this.bucket}` : `https://${this.bucket}.s3.amazonaws.com`;

    this.client = new S3Client({
      endpoint,
      forcePathStyle: Boolean(endpoint), // MinIO needs path-style; real S3 doesn't
      region: process.env.AWS_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, url: `${this.publicBaseUrl}/${key}` };
  }
}
