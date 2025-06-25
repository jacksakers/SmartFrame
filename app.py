# app.py
# This file goes in /home/pi/smart-frame/

import os
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

# --- Configuration ---
# The folder where uploaded photos will be stored.
UPLOAD_FOLDER = os.path.join('static', 'uploads')
# The file extensions we'll permit for uploads.
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
# The path to the file containing reminders.
REMINDERS_FILE = os.path.join('static', 'reminders.txt')


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


# --- API Endpoint for Photo Uploads ---
@app.route('/upload', methods=['GET', 'POST'])
def upload_file():
    """
    Handles file uploads. A GET request shows the upload form,
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

    # If it's a GET request, show a simple HTML form for uploading files.
    return '''
    <!doctype html>
    <title>Upload New Photo</title>
    <h1>Upload New Photo to Smart Frame</h1>
    <form method=post enctype=multipart/form-data>
      <input type=file name=file>
      <input type=submit value=Upload>
    </form>
    '''

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

# --- API Endpoint for Reminders ---
@app.route('/api/reminders')
def get_reminders():
    """
    Reads reminders from the reminders.txt file and returns them.
    """
    try:
        # Ensure the reminders file exists, create it if it doesn't
        if not os.path.exists(REMINDERS_FILE):
             with open(REMINDERS_FILE, 'w') as f:
                f.write("Add your reminders here, one per line!")

        with open(REMINDERS_FILE, 'r') as f:
            reminders = [line.strip() for line in f.readlines() if line.strip()]
        return jsonify(reminders)
    except Exception as e:
        print(f"Error reading reminders file: {e}")
        return jsonify({"error": "Could not read reminders file"}), 500


# --- Run the App ---
if __name__ == '__main__':
    # Running on 0.0.0.0 makes the server accessible from other devices on the same network.
    app.run(host='0.0.0.0', port=5000, debug=True)