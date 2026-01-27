import { supabaseAdmin, storageBucket } from "@/server/storage/supabase";

export const createUploadUrl = async (path: string, upsert = false) => {
  const { data, error } = await supabaseAdmin.storage
    .from(storageBucket)
    .createSignedUploadUrl(path, { upsert });

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create upload URL.");
  }

  return data;
};

export const createViewUrl = async (path: string, expiresInSeconds: number) => {
  const { data, error } = await supabaseAdmin.storage
    .from(storageBucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create view URL.");
  }

  return data;
};

export const deleteFile = async (path: string) => {
  const { error } = await supabaseAdmin.storage.from(storageBucket).remove([path]);
  if (error) {
    throw new Error(error.message);
  }
};

export const downloadFile = async (path: string) => {
  const { data, error } = await supabaseAdmin.storage.from(storageBucket).download(path);
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download proof image.");
  }

  return data;
};
