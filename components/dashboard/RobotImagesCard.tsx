import { getPublicRobotImageUrl, listRobotImages } from "@/lib/supabase-storage";

export async function RobotImagesCard() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-medium">Robot Camera</h2>
        <p className="mt-2 text-sm text-text-secondary">Supabase Storage is not configured in Vercel yet.</p>
      </section>
    );
  }

  try {
    const images = await listRobotImages(6);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Robot Camera</h2>
            <p className="mt-1 text-xs text-text-secondary">Latest ESP32-CAM images</p>
          </div>
          <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Storage</span>
        </div>

        {images.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
            No robot images uploaded yet.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {images.map((image) => (
              <a key={image.name} href={getPublicRobotImageUrl(image.name)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border bg-background">
                <div className="aspect-video overflow-hidden">
                  <img src={getPublicRobotImageUrl(image.name)} alt={`Robot camera ${image.name}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                </div>
                <p className="truncate px-3 py-2 text-xs text-text-secondary">{image.name}</p>
              </a>
            ))}
          </div>
        )}
      </section>
    );
  } catch {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-medium">Robot Camera</h2>
        <p className="mt-2 text-sm text-text-secondary">Unable to read robot images from Supabase Storage.</p>
      </section>
    );
  }
}
