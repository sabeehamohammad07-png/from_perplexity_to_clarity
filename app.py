import os
import io
import sys
import base64
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google import genai

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

app = Flask(__name__, static_folder='.')
CORS(app)

client = genai.Client(api_key="AIzaSyBABaRkRnZQtaYDrqhKs8RCpJJY34uotnA")

# In-memory storage: store raw PDF bytes so Gemini can "see" the document
uploaded_pdf_bytes = None
uploaded_pdf_name = None

@app.route('/test')
def test_endpoint():
    return jsonify({"status": "ok", "version": "v4-gemini-native-pdf"})

# --- API Endpoints ---

@app.route('/upload', methods=['POST'])
def upload_pdf():
    global uploaded_pdf_bytes, uploaded_pdf_name
    
    app.logger.warning("=== /upload endpoint hit ===")
    app.logger.warning(f"  request.files keys: {list(request.files.keys())}")
    
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request."}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file."}), 400
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": f"Invalid file type. Only .pdf files are allowed."}), 400

    try:
        raw_bytes = file.read()
        app.logger.warning(f"  Read {len(raw_bytes)} bytes from '{file.filename}'")
        
        if len(raw_bytes) == 0:
            return jsonify({"error": "The uploaded file is empty (0 bytes)."}), 400
        
        # Store raw PDF bytes - Gemini will read the PDF directly (including handwritten text)
        uploaded_pdf_bytes = raw_bytes
        uploaded_pdf_name = file.filename
        
        app.logger.warning(f"  SUCCESS: Stored PDF in memory for Gemini native processing")
        
        return jsonify({
            "message": f"Successfully loaded '{file.filename}'. Gemini will read this document directly, including any handwritten content."
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to process PDF: {str(e)}"}), 500

@app.route('/chat', methods=['POST'])
def chat():
    user_message = request.form.get('message', '')
    history_json = request.form.get('history', '[]')
    
    try:
        history = json.loads(history_json)
    except:
        history = []

    # Check for audio file
    audio_file = request.files.get('audio')
    audio_content = None
    if audio_file:
        audio_content = audio_file.read()

    # Build parts list for Gemini
    parts = []
    
    # If a PDF is loaded, include it as inline data so Gemini can "see" it
    if uploaded_pdf_bytes:
        pdf_b64 = base64.standard_b64encode(uploaded_pdf_bytes).decode('utf-8')
        parts.append({
            'inline_data': {
                'mime_type': 'application/pdf',
                'data': pdf_b64
            }
        })
        if user_message:
            parts.append({'text': f"Based on the uploaded PDF document, answer the following question:\n\n{user_message}"})
        else:
            parts.append({'text': "Describe what is in this uploaded PDF document."})
    elif user_message:
        parts.append({'text': user_message})
    
    if audio_content:
        audio_b64 = base64.standard_b64encode(audio_content).decode('utf-8')
        parts.append({
            'inline_data': {
                'mime_type': audio_file.content_type or 'audio/webm',
                'data': audio_b64
            }
        })
    
    if not parts:
        return jsonify({"error": "No content provided"}), 400

    model_history = history.copy()
    model_history.append({
        'role': 'user', 
        'parts': parts
    })

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=model_history
        )
        
        ai_message = response.text
        
        # Save clean text-only history for the frontend
        display_user_msg = user_message if user_message else "[Voice Message]"
        history.append({
            'role': 'user', 
            'parts': [{'text': display_user_msg}]
        })
        history.append({
            'role': 'model',
            'parts': [{'text': ai_message}]
        })
        
        return jsonify({
            "response": ai_message,
            "history": history
        })
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        app.logger.error(f"Error calling model: {e}\n{error_traceback}")
        return jsonify({
            "error": str(e),
            "traceback": error_traceback if app.debug else None
        }), 500

# --- Static File Serving Last ---

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    app.run(debug=True, port=8000)
