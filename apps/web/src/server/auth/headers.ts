export type ResponseHeaders = Record<string, string | string[]>;

export const appendHeader = (
  headers: ResponseHeaders,
  name: string,
  value: string,
) => {
  const existing = headers[name];
  if (!existing) {
    headers[name] = value;
    return;
  }

  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }

  headers[name] = [existing, value];
};
