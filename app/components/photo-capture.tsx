"use client";

import { useEffect, useRef, useState } from "react";
import { prepareImageAttachment } from "../utils/image-attachment";
import { CampusDialog } from "./campus-dialog";
import styles from "./mobile-chat.module.scss";

type Crop = "none" | "trim" | "square";
type Photo = {
  file: File;
  preview: string;
  rotation: number;
  crop: Crop;
  edited?: { file: File; url: string };
};

async function renderPhoto(photo: Photo) {
  const image = new Image();
  image.src = photo.preview;
  await image.decode();
  const side = Math.min(image.width, image.height);
  const width = Math.max(
    1,
    Math.round(
      photo.crop === "square"
        ? side
        : image.width * (photo.crop === "trim" ? 0.82 : 1),
    ),
  );
  const height = Math.max(
    1,
    Math.round(
      photo.crop === "square"
        ? side
        : image.height * (photo.crop === "trim" ? 0.82 : 1),
    ),
  );
  const canvas = document.createElement("canvas");
  const sideways = photo.rotation % 180 !== 0;
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片编辑暂不可用。");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((photo.rotation * Math.PI) / 180);
    context.drawImage(
      image,
      Math.floor((image.width - width) / 2),
      Math.floor((image.height - height) / 2),
      width,
      height,
      -width / 2,
      -height / 2,
      width,
      height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("无法保存编辑后的图片。")),
        "image/jpeg",
        0.94,
      ),
    );
    return new File(
      [blob],
      photo.file.name.replace(/\.[^.]+$/, "") + "-编辑.jpg",
      { type: "image/jpeg" },
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export default function PhotoCapture({
  limit,
  onClose,
  onConfirm,
}: {
  limit: number;
  onClose: () => void;
  onConfirm: (files: File[], preparedImages: ReadonlyMap<File, string>) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, select] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController>();
  const urls = useRef(new Set<string>());
  const photo = photos[selected];
  useEffect(
    () => () => {
      operation.current?.abort();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
    },
    [],
  );

  async function add(files: File[]) {
    if (!files.length || busy) return;
    const control = new AbortController();
    operation.current = control;
    setBusy(true);
    setError("");
    const added: Photo[] = [];
    const errors: string[] = [];
    const room = limit - photos.length;
    if (files.length > room)
      errors.push("本条消息还可添加 " + room + " 张图片。");
    try {
      for (const file of files.slice(0, room)) {
        try {
          const preview = await prepareImageAttachment(file, control.signal);
          added.push({ file, preview, rotation: 0, crop: "none" });
        } catch (error) {
          if (!control.signal.aborted)
            errors.push(file.name + "：" + (error as Error).message);
        }
      }
      if (!control.signal.aborted) {
        setPhotos([...photos, ...added]);
        if (added.length) select(photos.length);
        setError(errors.join("\n"));
      }
    } finally {
      if (!control.signal.aborted) setBusy(false);
    }
  }

  function release(photo: Photo) {
    if (!photo.edited) return;
    URL.revokeObjectURL(photo.edited.url);
    urls.current.delete(photo.edited.url);
  }

  async function edit(rotation: number, crop: Crop) {
    if (!photo || busy) return;
    const control = new AbortController();
    operation.current = control;
    const next = {
      ...photo,
      rotation,
      crop,
      edited: undefined as Photo["edited"],
    };
    setBusy(true);
    setError("");
    try {
      if (rotation || crop !== "none") {
        const file = await renderPhoto(next);
        if (control.signal.aborted) return;
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        next.edited = { file, url };
      }
      release(photo);
      setPhotos(
        photos.map((item, index) => (index === selected ? next : item)),
      );
    } catch (error) {
      if (!control.signal.aborted) setError((error as Error).message);
    } finally {
      if (!control.signal.aborted) setBusy(false);
    }
  }

  function imageInput(ref: typeof camera, capture?: "environment") {
    return (
      <input
        hidden
        ref={ref}
        type="file"
        multiple
        accept="image/*"
        capture={capture}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void add(files);
        }}
      />
    );
  }

  return (
    <CampusDialog title="拍照识题" onClose={onClose}>
      {imageInput(camera, "environment")}
      {imageInput(gallery)}
      <div className={styles.photoToolbar}>
        <button
          type="button"
          disabled={busy || photos.length >= limit}
          onClick={() => camera.current?.click()}
        >
          {photos.length ? "再拍一张" : "打开相机"}
        </button>
        <button
          type="button"
          disabled={busy || photos.length >= limit}
          onClick={() => gallery.current?.click()}
        >
          从相册选图
        </button>
        <small>
          {photos.length} / {limit} 张
        </small>
      </div>
      {photo && (
        <>
          <img
            className={styles.photoPreview}
            src={photo.edited?.url ?? photo.preview}
            alt={"第 " + (selected + 1) + " 张题图预览"}
          />
          <div className={styles.photoToolbar}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void edit((photo.rotation + 90) % 360, photo.crop)}
            >
              旋转 90°
            </button>
            <label>
              快速裁剪
              <select
                value={photo.crop}
                disabled={busy}
                onChange={(event) =>
                  void edit(photo.rotation, event.target.value as Crop)
                }
              >
                <option value="none">原始画幅</option>
                <option value="trim">去除边缘</option>
                <option value="square">正方形</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                release(photo);
                setPhotos(photos.filter((_, index) => index !== selected));
                select(Math.max(0, selected - 1));
              }}
            >
              移除此图
            </button>
          </div>
          {photos.length > 1 && (
            <div className={styles.photoThumbnails} aria-label="选择预览图片">
              {photos.map((item, index) => (
                <button
                  type="button"
                  key={index}
                  disabled={busy}
                  aria-pressed={selected === index}
                  aria-label={"第 " + (index + 1) + " 张图片"}
                  onClick={() => select(index)}
                >
                  <img src={item.edited?.url ?? item.preview} alt="" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {busy && <p role="status">正在处理图片…</p>}
      {error && (
        <p className={styles.photoError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.photoToolbar}>
        <button
          type="button"
          className={styles.photoConfirm}
          disabled={busy || !photos.length}
          onClick={() => {
            const preparedImages = new Map(
              photos
                .filter((item) => !item.edited)
                .map((item) => [item.file, item.preview] as const),
            );
            onConfirm(
              photos.map((item) => item.edited?.file ?? item.file),
              preparedImages,
            );
          }}
        >
          添加照片
        </button>
      </div>
    </CampusDialog>
  );
}
