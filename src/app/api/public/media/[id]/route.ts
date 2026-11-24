import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/server/db";
import { storage, publicBucket } from "@/server/storage";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const media = await db.mediaAsset.findFirst({
    where: { id, status: "APPROVED" },
  });
  if (!media) return new Response(null, { status: 404 });
  const url = `/api/public/media/${id}`;
  const active = await db.publicContent.findFirst({
    where: {
      publishAt: { lte: new Date() },
      media: { array_contains: [{ url, caption: media.caption }] },
    },
    select: { publicId: true },
  });
  if (!active) return new Response(null, { status: 404 });
  try {
    const result = await storage.send(
      new GetObjectCommand({ Bucket: publicBucket, Key: media.publicKey }),
    );
    return new Response(new Uint8Array(await result.Body!.transformToByteArray()).buffer, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
