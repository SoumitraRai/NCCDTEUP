import "dotenv/config";
import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  HeadBucketCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import { storage, privateBucket, publicBucket } from "../src/server/storage";
for (const Bucket of [privateBucket, publicBucket]) {
  try {
    await storage.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await storage.send(new CreateBucketCommand({ Bucket }));
  }
  try {
    await storage.send(
      new PutPublicAccessBlockCommand({
        Bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
  } catch (error) {
    // MinIO does not implement PublicAccessBlock. Its buckets are private
    // unless a bucket policy grants access, so require that none exists.
    try {
      await storage.send(new GetBucketPolicyCommand({ Bucket }));
      throw new Error(`Bucket ${Bucket} has a policy; remove it before use.`, {
        cause: error,
      });
    } catch (policyError) {
      if ((policyError as { name?: string }).name !== "NoSuchBucketPolicy")
        throw policyError;
    }
  }
}
console.log(
  "Buckets initialized with anonymous access blocked. Public derivatives are served through the publication-aware proxy.",
);
