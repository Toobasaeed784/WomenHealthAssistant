"""
Backend for the ElevenLabs Voice Agent web demo.

Responsibilities (kept intentionally minimal):
1. Serve the single HTML page + static assets.
2. Provide a small server-side endpoint (/api/get-signed-url) that asks
   ElevenLabs for a short-lived signed WebSocket URL for the existing agent.
   The API key never leaves the server / is never sent to the browser.

Why not the DefaultAudioInterface() approach from the ElevenLabs Python
conversational-ai example?
That example captures audio directly from the local machine's mic/speakers
via PyAudio - it's meant for a terminal script, not a browser UI. For a
web interface, the browser has to own the microphone, so the current,
officially documented pattern is:
  browser (mic) --Web SDK--> signed WebSocket URL --> ElevenLabs agent
and the ONLY thing the Python backend does is mint that signed URL using
your secret API key. This is the approach ElevenLabs documents for
private/authenticated agents used from a browser.
"""

import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
AGENT_ID = os.getenv("AGENT_ID")

SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"

app = Flask(__name__, static_folder="public", static_url_path="")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/get-signed-url")
def get_signed_url():
    if not ELEVENLABS_API_KEY:
        return jsonify(error="ELEVENLABS_API_KEY is not set in .env"), 500
    if not AGENT_ID:
        return jsonify(error="AGENT_ID is not set in .env"), 500

    try:
        response = requests.get(
            SIGNED_URL_ENDPOINT,
            params={"agent_id": AGENT_ID},
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            timeout=10,
        )
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        return jsonify(error=f"Failed to get signed URL: {exc}"), 502

    return jsonify(signed_url=response.json()["signed_url"])


if __name__ == "__main__":
    app.run(debug=True, port=5000)
