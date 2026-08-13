/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
import type { ImgHTMLAttributes } from "react";

type RawPreviewImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
};

export function RawPreviewImage(props: RawPreviewImageProps) {
  // Studio previews can be blob/data URLs or user/provider URLs that should not go through Next image optimization.
  // Default to lazy + async decoding (below-fold previews); callers can override via {...props}.
  return <img loading="lazy" decoding="async" {...props} />;
}
