"use client";

import { useEffect, useState } from "react";
import { loadSimulationImage } from "../client/simulation-image";
import { useAccessStore } from "../store/access";
import { SIMULATION_IMAGE_TYPES } from "../utils/python-stream";
import { showImageModal } from "./ui-lib";
import styles from "./engineering-plot.module.scss";

export default function SimulationImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const identity = useAccessStore((state) => state.friendProfile?.identityId);
  const [image, setImage] = useState<{ url: string; type: string }>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setImage(undefined);
    setError("");
    loadSimulationImage(src)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ url: objectUrl, type: blob.type });
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, identity, attempt]);

  if (!image) {
    return (
      <span className={styles.simulationImage}>
        <span role="status">{error || "仿真图表加载中…"}</span>
        {error && (
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            重试加载
          </button>
        )}
      </span>
    );
  }

  const extension =
    Object.entries(SIMULATION_IMAGE_TYPES).find(
      ([, type]) => type === image.type,
    )?.[0] ?? "png";
  return (
    <span className={styles.simulationImage}>
      <button
        className={styles.imagePreview}
        type="button"
        aria-label={"放大" + alt}
        onClick={() => showImageModal(image.url, true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={alt} />
      </button>
      <a href={image.url} download={"仿真图表." + extension}>
        下载图表
      </a>
    </span>
  );
}
