import { createHash, createHmac } from "node:crypto";

const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
const region = process.env.ALIYUN_OSS_REGION?.trim();

if (!accessKeyId || !accessKeySecret || !bucket || !region) {
  throw new Error("Missing OSS env: ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_BUCKET / ALIYUN_OSS_REGION");
}

const endpoint = `${bucket}.${region}.aliyuncs.com`;

function prefixRule(id: string, prefix: string, days: number) {
  return `  <Rule>\n    <ID>${id}</ID>\n    <Prefix>${prefix.replace(/\/+$/, "")}/</Prefix>\n    <Status>Enabled</Status>\n    <Expiration><Days>${days}</Days></Expiration>\n  </Rule>`;
}

const rules = [
  prefixRule("delete-temp", process.env.ALIYUN_OSS_TEMP_PREFIX || "temp/original", 1),
  prefixRule("delete-user-uploads", process.env.ALIYUN_OSS_UPLOAD_PREFIX || "user-uploads/original", 30),
  prefixRule("delete-generated-results", process.env.ALIYUN_OSS_GENERATED_PREFIX || "generated-results/original", 60),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<LifecycleConfiguration>\n${rules.join("\n")}\n</LifecycleConfiguration>\n`;

function sign(method: string, contentType: string, contentMd5: string, date: string, resource: string) {
  const stringToSign = `${method}\n${contentMd5}\n${contentType}\n${date}\n${resource}`;
  return createHmac("sha1", accessKeySecret!).update(stringToSign).digest("base64");
}

async function putLifecycle() {
  const date = new Date().toUTCString();
  const contentType = "application/xml";
  const contentMd5 = createHash("md5").update(xml, "utf8").digest("base64");
  const resource = `/${bucket}/?lifecycle`;
  const signature = sign("PUT", contentType, contentMd5, date, resource);

  const response = await fetch(`https://${endpoint}/?lifecycle`, {
    method: "PUT",
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      Date: date,
      "Content-Type": contentType,
      "Content-MD5": contentMd5,
    },
    body: xml,
  });

  const body = await response.text();
  console.log("PUT lifecycle", response.status, response.statusText);
  if (body) console.log(body.slice(0, 2000));
  if (!response.ok) process.exit(1);
}

async function getLifecycle() {
  const date = new Date().toUTCString();
  const resource = `/${bucket}/?lifecycle`;
  const signature = sign("GET", "", "", date, resource);

  const response = await fetch(`https://${endpoint}/?lifecycle`, {
    method: "GET",
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      Date: date,
    },
  });

  const body = await response.text();
  console.log("GET lifecycle", response.status, response.statusText);
  if (body) console.log(body.slice(0, 4000));
}

async function main() {
  await putLifecycle();
  await getLifecycle();
}

void main();
