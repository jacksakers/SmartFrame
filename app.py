# app.py
# This file goes in /home/pi/smart-frame/

import os
from flask import Flask, render_template, request, jsonify, send_from_directory, Response
from werkzeug.utils import secure_filename
import subprocess
import threading
import time

# --- Configuration ---
# The folder where uploaded photos will be stored.
UPLOAD_FOLDER = os.path.join('static', 'uploads')
# The file extensions we'll permit for uploads.
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
# The path to the file containing reminders.
REMINDERS_FILE = os.path.join('static', 'reminders.txt')
# RTSP camera configuration
RTSP_STREAM_URL = "rtsp://inspiration:ideasFlowFreely09@192.168.0.131/stream1"  # Replace with your actual RTSP URL


# --- Flask App Initialization ---
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
# Set a limit for the maximum content length of an upload (e.g., 16MB)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024


# --- Helper Function ---
def allowed_file(filename):
    """Checks if a filename has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# --- Main Route ---
@app.route('/')
def index():
    """
    Renders the main display page (index.html).
    This is what the Pi's monitor will show.
    """
    return render_template('index.html')

@app.route('/camera-test')
def camera_test_page():
    """Test page for camera streaming."""
    return render_template('camera_test.html')


# --- API Endpoint for Photo Uploads ---
@app.route('/upload', methods=['GET', 'POST'])
def upload_file():
    """
    Handles file uploads. A GET request shows the upload interface,
    and a POST request processes the uploaded file.
    You will access this page from your main computer's browser.
    """
    if request.method == 'POST':
        # Check if the post request has the file part
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        file = request.files['file']
        # If the user does not select a file, the browser submits an empty file without a filename.
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        if file and allowed_file(file.filename):
            # Sanitize the filename to prevent security issues
            filename = secure_filename(file.filename)
            # Save the file to the configured upload folder
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            # Return a success message
            return jsonify({"success": f"File '{filename}' uploaded successfully"}), 201
        else:
            return jsonify({"error": "File type not allowed"}), 400

    # If it's a GET request, show the new upload interface
    return render_template('upload.html')

# --- API Endpoint to List Photos ---
@app.route('/api/photos')
def get_photos():
    """
    Provides a JSON list of all the photo filenames in the uploads folder.
    The frontend JavaScript will call this to know which photos to display.
    """
    try:
        # Get a list of all files in the upload folder
        files = os.listdir(app.config['UPLOAD_FOLDER'])
        # Filter the list to only include files with allowed extensions
        photo_files = [f for f in files if allowed_file(f)]
        return jsonify(photo_files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- API Endpoints for Reminders ---
@app.route('/api/reminders', methods=['GET', 'POST'])
def manage_reminders():
    """
    GET: Reads reminders from the reminders.txt file and returns them.
    POST: Adds a new reminder to the reminders file.
    """
    try:
        # Ensure the reminders file exists, create it if it doesn't
        if not os.path.exists(REMINDERS_FILE):
             with open(REMINDERS_FILE, 'w') as f:
                f.write("Add your reminders here, one per line!")

        # GET request - return all reminders
        if request.method == 'GET':
            with open(REMINDERS_FILE, 'r') as f:
                reminders = [line.strip() for line in f.readlines() if line.strip()]
            return jsonify(reminders)
        
        # POST request - add a new reminder
        elif request.method == 'POST':
            data = request.get_json()
            if not data or 'text' not in data:
                return jsonify({"error": "No reminder text provided"}), 400
            
            reminder_text = data['text'].strip()
            if not reminder_text:
                return jsonify({"error": "Reminder text cannot be empty"}), 400
                
            # Read existing reminders
            with open(REMINDERS_FILE, 'r') as f:
                reminders = [line.strip() for line in f.readlines() if line.strip()]
            
            # Add new reminder
            reminders.append(reminder_text)
            
            # Write back to file
            with open(REMINDERS_FILE, 'w') as f:
                for reminder in reminders:
                    f.write(f"{reminder}\n")
                    
            return jsonify({"success": "Reminder added successfully"}), 201
            
    except Exception as e:
        print(f"Error managing reminders: {e}")
        return jsonify({"error": "Could not manage reminders"}), 500

@app.route('/api/reminders/<int:index>', methods=['DELETE'])
def delete_reminder(index):
    """Deletes a specific reminder by its index."""
    try:
        # Read existing reminders
        with open(REMINDERS_FILE, 'r') as f:
            reminders = [line.strip() for line in f.readlines() if line.strip()]
        
        # Check if index is valid
        if index < 0 or index >= len(reminders):
            return jsonify({"error": "Invalid reminder index"}), 400
        
        # Remove the reminder at the specified index
        reminders.pop(index)
        
        # Write back to file
        with open(REMINDERS_FILE, 'w') as f:
            for reminder in reminders:
                f.write(f"{reminder}\n")
                
        return jsonify({"success": "Reminder deleted successfully"}), 200
        
    except Exception as e:
        print(f"Error deleting reminder: {e}")
        return jsonify({"error": "Could not delete reminder"}), 500

@app.route('/api/photos/<filename>', methods=['DELETE'])
def delete_photo(filename):
    """Deletes a specific photo by its filename."""
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Check if the file exists
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404
        
        # Delete the file
        os.remove(file_path)
        return jsonify({"success": f"Photo '{filename}' deleted successfully"}), 200
        
    except Exception as e:
        print(f"Error deleting photo: {e}")
        return jsonify({"error": "Could not delete photo"}), 500


# --- RTSP Camera Streaming ---
@app.route('/api/camera/stream')
def camera_stream():
    """
    Provides an MJPEG stream converted from RTSP using FFmpeg.
    This allows the browser to display the camera feed.
    """
    if RTSP_STREAM_URL == "rtsp://your-camera-ip:554/stream":
        return jsonify({"error": "RTSP stream URL not configured"}), 400
    
    def generate():
        try:
            # Use FFmpeg to convert RTSP to individual JPEG frames
            cmd = [
                'ffmpeg',
                '-rtsp_transport', 'tcp',  # Use TCP for more reliable connection
                '-i', RTSP_STREAM_URL,
                '-f', 'image2pipe',
                '-pix_fmt', 'yuvj420p',
                '-vcodec', 'mjpeg',
                '-vf', 'scale=1280:720',  # Scale to 720p for better performance
                '-q:v', '3',  # Quality setting (1-31, lower is better)
                '-r', '5',   # Frame rate (5 fps for lower bandwidth)
                '-'
            ]
            
            print(f"Starting FFmpeg with command: {' '.join(cmd)}")
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0
            )
            
            # Read JPEG frames and format as MJPEG stream
            while True:
                # Read JPEG frame data
                frame_data = b''
                
                # Look for JPEG start marker (FF D8)
                while True:
                    byte = process.stdout.read(1)
                    if not byte:
                        return
                    if byte == b'\xff':
                        next_byte = process.stdout.read(1)
                        if not next_byte:
                            return
                        if next_byte == b'\xd8':  # JPEG start marker
                            frame_data = b'\xff\xd8'
                            break
                
                # Read until JPEG end marker (FF D9)
                while True:
                    byte = process.stdout.read(1)
                    if not byte:
                        return
                    frame_data += byte
                    if len(frame_data) >= 2 and frame_data[-2:] == b'\xff\xd9':
                        break
                
                if frame_data:
                    # Format as MJPEG with proper boundaries
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n'
                           b'Content-Length: ' + str(len(frame_data)).encode() + b'\r\n\r\n' +
                           frame_data + b'\r\n')
                
        except Exception as e:
            print(f"Error streaming camera: {e}")
            # Check if FFmpeg process has errors
            if 'process' in locals():
                stderr_output = process.stderr.read().decode('utf-8', errors='ignore')
                print(f"FFmpeg stderr: {stderr_output}")
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/camera/info')
def camera_info():
    """Returns information about the camera stream configuration."""
    return jsonify({
        "rtsp_url": RTSP_STREAM_URL,
        "configured": RTSP_STREAM_URL != "rtsp://your-camera-ip:554/stream",
        "stream_endpoint": "/api/camera/stream"
    })

@app.route('/api/camera/test')
def camera_test():
    """Test FFmpeg connection to RTSP stream without streaming."""
    try:
        # Test command that just checks if we can connect to the stream
        cmd = [
            'ffmpeg',
            '-rtsp_transport', 'tcp',
            '-i', RTSP_STREAM_URL,
            '-t', '1',  # Only test for 1 second
            '-f', 'null',
            '-'
        ]
        
        print(f"Testing FFmpeg connection: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        return jsonify({
            "success": result.returncode == 0,
            "return_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "command": ' '.join(cmd)
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({
            "success": False,
            "error": "FFmpeg test timed out",
            "command": ' '.join(cmd)
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "command": ' '.join(cmd) if 'cmd' in locals() else "Command not created"
        })


# --- Run the App ---
if __name__ == '__main__':
    # Running on 0.0.0.0 makes the server accessible from other devices on the same network.
    app.run(host='0.0.0.0', port=5000, debug=True)