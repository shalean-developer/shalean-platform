import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { GET, POST, DELETE } from "../route";

const mock = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth/customerBearer", () => ({ requireCustomerSession: mock.auth }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mock.admin }));
const id = "11111111-1111-4111-8111-111111111111";
const oldPath = `${id}/22222222-2222-4222-8222-222222222222.webp`;
const upload = vi.fn(); const remove = vi.fn(); const download = vi.fn(); const update = vi.fn();
const getUser = vi.fn(); const getBucket = vi.fn(); const createBucket = vi.fn();
const from = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ ok: true, session: { userId: id } });
  getUser.mockResolvedValue({ data: { user: { id, user_metadata: { customer_avatar_path: oldPath } } }, error: null });
  getBucket.mockResolvedValue({ data: { public: false }, error: null });
  createBucket.mockResolvedValue({ error: null });
  upload.mockResolvedValue({ error: null }); remove.mockResolvedValue({ error: null });
  update.mockResolvedValue({ error: null }); download.mockResolvedValue({ data: new Blob(["photo"], { type: "image/webp" }), error: null });
  from.mockReturnValue({ upload, remove, download });
  mock.admin.mockReturnValue({ auth: { admin: { getUserById: getUser, updateUserById: update } }, storage: { from, getBucket, createBucket } });
});

async function photoRequest() {
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "blue" } }).png().toBuffer();
  const form = new FormData(); form.append("file", new Blob([new Uint8Array(image)], { type: "image/png" }), "photo.png");
  return new Request("http://localhost/api/customer/avatar", { method: "POST", body: form });
}

describe("private customer avatar API", () => {
  it("rejects unauthenticated reads and writes before accessing storage", async () => {
    mock.auth.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    for (const handler of [GET, POST, DELETE]) expect((await handler(new Request("http://localhost/api/customer/avatar"))).status).toBe(401);
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it("cannot read another customer's object through edited metadata", async () => {
    getUser.mockResolvedValue({ data: { user: { id, user_metadata: { customer_avatar_path: oldPath.replace(id, "99999999-9999-4999-8999-999999999999") } } } });
    expect((await GET(new Request("http://localhost/api/customer/avatar"))).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
  it("serves only the verified user's image without shared caching", async () => {
    const response = await GET(new Request("http://localhost/api/customer/avatar?userId=other"));
    expect(download).toHaveBeenCalledWith(oldPath);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/webp");
  });
  it("validates bytes rather than trusting an image MIME type", async () => {
    const form = new FormData(); form.append("file", new Blob(["not an image"], { type: "image/png" }), "bad.png");
    expect((await POST(new Request("http://localhost/api/customer/avatar", { method: "POST", body: form }))).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
  it("does not upload oversized files or use a public bucket", async () => {
    const request = new Request("http://localhost/api/customer/avatar", { method: "POST", headers: { "content-length": "9000000" } });
    expect((await POST(request)).status).toBe(413);
    getBucket.mockResolvedValue({ data: { public: true }, error: null });
    expect((await POST(await photoRequest())).status).toBe(503);
    expect(upload).not.toHaveBeenCalled();
  });
  it("caps the actual request body even when content-length is absent", async () => {
    const request = new Request("http://localhost/api/customer/avatar", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" },
      body: new Uint8Array(2 * 1024 * 1024 + 65537),
    });
    expect((await POST(request)).status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });
  it("normalizes the photo and changes only the verified user's photo metadata", async () => {
    expect((await POST(await photoRequest())).status).toBe(200);
    const [path, image, options] = upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${id}/[a-f0-9-]{36}\\.webp$`));
    const decoded = await sharp(image).metadata();
    expect([decoded.width, decoded.height, decoded.format]).toEqual([256, 256, "webp"]);
    expect(options.upsert).toBe(false);
    expect(update).toHaveBeenCalledWith(id, { user_metadata: { customer_avatar_path: path, customer_avatar_removed: false } });
    expect(remove).toHaveBeenCalledWith([oldPath]);
  });
  it("preserves the previous photo when the metadata save fails", async () => {
    update.mockResolvedValue({ error: { message: "failure" } });
    expect((await POST(await photoRequest())).status).toBe(500);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
    expect(remove).not.toHaveBeenCalledWith([oldPath]);
  });
  it("removes the reference before deleting the verified user's old photo", async () => {
    expect((await DELETE(new Request("http://localhost/api/customer/avatar", { method: "DELETE" }))).status).toBe(200);
    expect(update).toHaveBeenCalledWith(id, { user_metadata: { customer_avatar_path: null, customer_avatar_removed: true } });
    expect(remove).toHaveBeenCalledWith([oldPath]);
  });
});
