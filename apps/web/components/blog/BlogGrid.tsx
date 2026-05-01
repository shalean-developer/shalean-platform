import type { BlogIndexPost } from "@/lib/blog/get-all-posts";
import { BlogCard } from "@/components/blog/BlogCard";

type Props = {
  posts: BlogIndexPost[];
  /** First N cards use eager image loading */
  eagerImageCount?: number;
};

export function BlogGrid({ posts, eagerImageCount = 0 }: Props) {
  if (posts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3 lg:gap-8">
      {posts.map((post, i) => (
        <BlogCard key={post.slug} post={post} priority={i < eagerImageCount} />
      ))}
    </div>
  );
}
