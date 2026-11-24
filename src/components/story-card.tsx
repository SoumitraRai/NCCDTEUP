import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  MapPin,
  Flag,
  Leaf,
  Users,
  Mountain,
  Trophy,
} from "lucide-react";
import { messages, type Locale } from "@/lib/localization/messages";
type Story = {
  publicId: string;
  slug: string;
  category: string;
  title: string;
  summary: string;
  district: string;
  media?:unknown;
};
export function StoryCard({
  story,
  locale,
  index = 0,
}: {
  story: Story;
  locale: Locale;
  index?: number;
}) {
  const t = messages[locale];
  const Icon = [Flag, Leaf, Mountain, Users, Trophy][index % 5];
  return (
    <article className="story-card">
      <Link
        href={`/${locale}/stories?slug=${story.slug}`}
        className={`story-art art-${index % 3}`}
        aria-label={story.title}
      >
        {Array.isArray(story.media)&&story.media.length>0&&typeof story.media[0]?.url==="string"?<Image src={story.media[0].url} alt={String(story.media[0].caption??"")} fill sizes="(max-width:760px) 90vw, 30vw" unoptimized style={{objectFit:"cover"}}/>:<div className="art-orbit" />}
        {(!Array.isArray(story.media)||!story.media.length)&&<Icon size={68} strokeWidth={1} />}
        <span className="art-caption">
          {t.synthetic} / {String(index + 1).padStart(2, "0")}
        </span>
        <span className="circle-arrow">
          <ArrowUpRight size={20} />
        </span>
      </Link>
      <div className="story-body">
        <div className="meta">
          <span>
            {
              (
                {
                  VISIT: t.visit,
                  ACHIEVEMENT: t.achievement,
                  ACTIVITY: t.activity,
                  GALLERY: t.gallery,
                  NOTICE: t.notices,
                } as Record<string, string>
              )[story.category]
            }
          </span>
          <span>
            <MapPin size={12} />
            {story.district}
          </span>
        </div>
        <h3>
          <Link href={`/${locale}/stories?slug=${story.slug}`}>
            {story.title}
          </Link>
        </h3>
        <p>{story.summary}</p>
      </div>
    </article>
  );
}
