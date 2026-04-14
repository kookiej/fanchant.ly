import os
import time
import json
import urllib.request
import urllib.error


SLEEP_INTERVAL = 10
SERVER = "https://restapi.gaudiolab.io/developers/api"
 
API_CREATE_UPLOAD   = "/v1/files/upload-multipart/create"
API_COMPLETE_UPLOAD = "/v1/files/upload-multipart/complete"
API_CREATE_JOB      = "/v1/gts_lyrics_line_v1/jobs"
API_JOB_STATUS      = "/v1/gts_lyrics_line_v1/jobs/{}"

API_KEY         = "c9babfd6094b83aa31b36886477b7c1b71a9b6dcb752d183640b58d398d0546ac9f2fade1e749e75727b32ae8047b383"
INPUT_AUDIO_FILE = "C:/Users/yeooo/Desktop/ATEEZ - Adrenaline.mp3"
INPUT_TEXT_FILE  = "C:/Users/yeooo/Desktop/ATEEZ - Adrenaline.txt"


def send_request(method: str, api: str, payload: dict) -> dict:
    headers = {
        "x-ga-apikey": API_KEY,
        "Content-Type": "application/json",
    }
    url  = SERVER + api
    data = json.dumps(payload).encode() if method == "POST" else None
    req  = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ERROR) HTTP {e.code}: {body}")
        raise


def put_chunk(url: str, data: bytes) -> str:
    """S3 presigned URL에 PUT 업로드 → ETag 반환"""
    req = urllib.request.Request(url, data=data, method="PUT")
    with urllib.request.urlopen(req) as resp:
        return resp.headers.get("ETag", "").replace('"', "")


def read_in_chunks(file_object, chunk_size):
    while True:
        data = file_object.read(chunk_size)
        if not data:
            break
        yield data


def main():
    # ── Upload audio file ──────────────────────────────────────────
    print("\n[STEP] Create Upload URL")
    print("-" * 40)
    payload = {
        "fileName": os.path.basename(INPUT_AUDIO_FILE),
        "fileSize": os.path.getsize(INPUT_AUDIO_FILE),
    }
    resp = send_request("POST", API_CREATE_UPLOAD, payload)
    if resp.get("resultCode") != 1000:
        print(f"  ERROR) {resp.get('resultMessage')}")
        return
    result_data      = resp["resultData"]
    chunk_size       = result_data["chunkSize"]
    audio_upload_id  = result_data["uploadId"]
    audio_upload_urls = result_data["preSignedUrl"]
    print(f"  SUCCESS) audio_upload_id: {audio_upload_id}")

    print("\n[STEP] Upload File")
    print("-" * 40)
    parts = []
    with open(INPUT_AUDIO_FILE, "rb") as f:
        print(f"  INFO) Uploading {len(audio_upload_urls)} chunk(s)")
        for i, chunk in enumerate(read_in_chunks(f, chunk_size)):
            etag = put_chunk(audio_upload_urls[i], chunk)
            parts.append({"awsETag": etag, "partNumber": i + 1})
            print(f"    PROGRESS) chunk {i+1}/{len(audio_upload_urls)} uploaded")

    print("\n[STEP] Complete Upload")
    print("-" * 40)
    resp = send_request("POST", API_COMPLETE_UPLOAD, {"uploadId": audio_upload_id, "parts": parts})
    if resp.get("resultCode") != 1000:
        print(f"  ERROR) {resp.get('resultMessage')}")
        return
    print("  SUCCESS) Upload completed successfully")


    # ── Upload text file ───────────────────────────────────────────
    print("\n[STEP] Create Upload URL")
    print("-" * 40)
    payload = {
        "fileName": os.path.basename(INPUT_TEXT_FILE),
        "fileSize": os.path.getsize(INPUT_TEXT_FILE),
    }
    resp = send_request("POST", API_CREATE_UPLOAD, payload)
    if resp.get("resultCode") != 1000:
        print(f"  ERROR) {resp.get('resultMessage')}")
        return
    result_data     = resp["resultData"]
    chunk_size      = result_data["chunkSize"]
    text_upload_id  = result_data["uploadId"]
    text_upload_urls = result_data["preSignedUrl"]
    print(f"  SUCCESS) text_upload_id: {text_upload_id}")

    print("\n[STEP] Upload File")
    print("-" * 40)
    parts = []
    with open(INPUT_TEXT_FILE, "rb") as f:
        print(f"  INFO) Uploading {len(text_upload_urls)} chunk(s)")
        for i, chunk in enumerate(read_in_chunks(f, chunk_size)):
            etag = put_chunk(text_upload_urls[i], chunk)
            parts.append({"awsETag": etag, "partNumber": i + 1})
            print(f"    PROGRESS) chunk {i+1}/{len(text_upload_urls)} uploaded")

    print("\n[STEP] Complete Upload")
    print("-" * 40)
    resp = send_request("POST", API_COMPLETE_UPLOAD, {"uploadId": text_upload_id, "parts": parts})
    if resp.get("resultCode") != 1000:
        print(f"  ERROR) {resp.get('resultMessage')}")
        return
    print("  SUCCESS) Upload completed successfully")


    # ── Create job ─────────────────────────────────────────────────
    print("\n[STEP] Create Job")
    print("-" * 40)
    resp = send_request("POST", API_CREATE_JOB, {
        "audioUploadId": audio_upload_id,
        "textUploadId":  text_upload_id,
        "language":      "en",
    })
    if resp.get("resultCode") != 1000:
        print(f"  ERROR) {resp.get('resultMessage')}")
        return
    job_id = resp["resultData"]["jobId"]
    print(f"  SUCCESS) job_id: {job_id}")


    # ── Check job status ───────────────────────────────────────────
    print("\n[STEP] Check Job Status")
    print("-" * 40)
    while True:
        resp = send_request("GET", API_JOB_STATUS.format(job_id), {})
        if resp.get("resultCode") != 1000:
            print(f"  ERROR) {resp.get('resultMessage')}")
            break

        result_data  = resp["resultData"]
        status       = result_data["status"]

        if status == "success":
            download_url = result_data.get("downloadUrl")
            print("  SUCCESS) Job completed!")
            print(f"  Download URLs: {json.dumps(download_url, indent=2, ensure_ascii=False)}")

            base_name = os.path.splitext(os.path.basename(INPUT_AUDIO_FILE))[0]

            for key, label, ext in [("lyrics", "CSV", ".csv"), ("reports", "JSON", ".json")]:
                file_url = download_url.get(key, {}).get("file")
                if not file_url:
                    print(f"  SKIP) {key} URL 없음")
                    continue
                out_path = os.path.join("./data/results", f"{base_name}_result{ext}")
                urllib.request.urlretrieve(file_url, out_path)
                print(f"  SAVED) {label}: {out_path}")
            break
        elif status == "failed":
            print(f"  ERROR) Job failed: {result_data.get('errorMessage')}")
            break

        print(f"    PROGRESS) Status: {status}")
        print(f"    PROGRESS) Retrying in {SLEEP_INTERVAL} seconds...")
        time.sleep(SLEEP_INTERVAL)


if __name__ == "__main__":
    main()