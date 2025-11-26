# GoPro Multi-Camera Controller with S3 Upload

Control multiple GoPro cameras via COHN (Camera on the Home Network) and automatically upload footage to AWS S3.

## Features

- ✅ Control multiple GoPro cameras simultaneously via COHN
- ✅ Start/stop timelapse recording
- ✅ Download files from all cameras
- ✅ Upload files to AWS S3 with organized folder structure
- ✅ Automatic file organization by camera IP and date
- ✅ Delete files after successful upload (optional)

## Setup

### 1. COHN Configuration

First, provision your GoPro cameras with COHN using the Python script:

```bash
cd /Users/daniel/projects/OpenGoPro/demos/python/tutorial
source venv/bin/activate
python tutorial_modules/tutorial_9_cohn/provision_cohn.py 'Your-WiFi-SSID' 'Your-WiFi-Password'
```

This will generate credentials. Add them to `cohn-config.json`:

```json
{
  "cameras": [
    {
      "username": "gopro",
      "password": "generated-password",
      "ip_address": "192.168.0.142",
      "certificate": "-----BEGIN CERTIFICATE-----\n..."
    }
  ]
}
```

### 2. AWS S3 Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and configure your S3 settings:

```env
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_S3_BUCKET=my-gopro-footage
AWS_S3_PREFIX=gopro-footage/

# AWS Credentials (optional - can use AWS CLI configured credentials instead)
# AWS_ACCESS_KEY_ID=your-access-key-id
# AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

**Note:** If you don't set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`, the SDK will use credentials from:

- AWS CLI (`~/.aws/credentials`)
- Environment variables
- IAM role (if running on EC2)

### 3. AWS Credentials

Make sure you have AWS credentials configured. You can do this by:

**Option 1: AWS CLI**

```bash
aws configure
```

**Option 2: Environment Variables**

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

**Option 3: IAM Role (if running on EC2)**
No configuration needed - uses instance role automatically.

### 4. Required IAM Permissions

Your AWS user/role needs these S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::my-gopro-footage/*"
    }
  ]
}
```

## Usage

### Install Dependencies

```bash
npm install
```

### Available Commands

```bash
# Get status of all cameras
npm run status

# Start timelapse on all cameras
npm run start-timelapse

# Stop timelapse
npm run stop-timelapse

# List files on all cameras
npm run list-files

# Download files from all cameras
npm run download-files

# Upload downloaded files to S3
npm run upload-files

# Upload and delete local files after successful upload
npm run upload-files -- --delete-after-upload

# Delete all files from cameras (requires --confirm)
npm run delete-files -- --confirm
```

### Typical Workflow

```bash
# 1. Start recording
npm run start-timelapse

# 2. Wait for desired duration...

# 3. Stop recording
npm run stop-timelapse

# 4. Download files
npm run download-files

# 5. Upload to S3 and delete local copies
npm run upload-files -- --delete-after-upload

# 6. (Optional) Delete files from cameras
npm run delete-files -- --confirm
```

## File Types Supported

- `.mp4` - Video files
- `.jpg`, `.jpeg`, `.png` - Images
- `.lrv` - GoPro low-resolution videos
- `.thm` - GoPro thumbnails

## Troubleshooting

### "Error: s3-config.json not found"

Create the file with your S3 configuration.

### "Error: cohn-config.json not found"

Run the COHN provisioning script first.

### "Access Denied" when uploading to S3

Check your AWS credentials and IAM permissions.

### Camera connection timeout

Make sure cameras are on the same network and COHN is properly configured.

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build TypeScript
npm run build
```

## License

ISC
