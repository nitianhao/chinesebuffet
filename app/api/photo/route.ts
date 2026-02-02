import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const photoReference = searchParams.get("photoReference") || "";
    const wRaw = searchParams.get("w");

    // Validate
    if (!photoReference || !photoReference.startsWith("places/")) {
      return Response.json(
        {
          error: "Invalid photoReference: must start with places/",
          received: photoReference,
        },
        { status: 400 }
      );
    }

    const wNum = Number(wRaw);
    const w = Number.isFinite(wNum) && wNum > 0 ? Math.round(wNum) : 800;

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return Response.json(
        { error: "Missing GOOGLE_MAPS_API_KEY on server" },
        { status: 500 }
      );
    }

    const placesBase = "https://places." + "googleapis.com/v1";
    const upstreamUrl = `${placesBase}/${photoReference}/media?maxWidthPx=${w}`;

    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        "X-Goog-Api-Key": key,
      },
      // Strong caching on the server fetch
      next: { revalidate: 60 * 60 * 24 * 30 },
    });

    if (!upstreamRes.ok) {
      const bodyText = await upstreamRes.text().catch(() => "");
      return Response.json(
        {
          error: "Google Places photo fetch failed",
          status: upstreamRes.status,
          body: bodyText.slice(0, 1200),
        },
        { status: 502 }
      );
    }

    const contentType =
      upstreamRes.headers.get("content-type") || "application/octet-stream";
    const bytes = await upstreamRes.arrayBuffer();

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Strong browser caching
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    return Response.json(
      { error: "Unexpected error in /api/photo", message: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
