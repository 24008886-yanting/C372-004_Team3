# Environment Configuration Guide

## Overview
This application now uses environment variables for sensitive configuration data instead of hardcoded values.

## Setup Instructions

### 1. Create Your Environment File

Copy the `.env.example` file to create your own `.env` file:

```bash
cp .env.example .env
```

### 2. Configure Your Environment Variables

Open the `.env` file and update the following values:

#### Database Configuration
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_database_password
DB_NAME=repawblic
```

#### Application Configuration
```env
PORT=3000
SESSION_SECRET=generate_a_random_secure_string_here
```

**Important:** For the `SESSION_SECRET`, generate a strong random string. You can use one of these methods:

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using PowerShell:**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

### 3. Security Best Practices

✅ **DO:**
- Keep your `.env` file private and never commit it to version control
- Use strong, unique values for `SESSION_SECRET`
- Change default passwords before deploying to production
- Use different credentials for development and production environments

❌ **DON'T:**
- Share your `.env` file or commit it to Git
- Use simple or common secrets
- Reuse passwords across different environments

### 4. Admin Account Setup

The application provides two ways to create an admin account:

#### Option A: Manual Setup (Recommended)
1. Start your application
2. Navigate to `/admin/setup`
3. Fill in the form to create your admin account
4. The credentials you enter will be securely hashed and stored

#### Option B: Automatic Setup (Advanced)
If you want to auto-create an admin account on first startup, uncomment and configure these variables in `.env`:

```env
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@repawblic.com
ADMIN_PASSWORD=your_secure_admin_password
```

**Note:** This feature would require additional code implementation in `app.js`.

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DB_HOST` | Database host address | Yes | `localhost` |
| `DB_USER` | Database username | Yes | `root` |
| `DB_PASSWORD` | Database password | Yes | - |
| `DB_NAME` | Database name | Yes | `repawblic` |
| `PORT` | Application port | No | `3000` |
| `SESSION_SECRET` | Secret key for session encryption | Yes | Fallback value (change for production) |

## Troubleshooting

### Application won't start
- Verify all required environment variables are set in `.env`
- Check that your database credentials are correct
- Ensure MySQL is running and accessible

### Session issues
- Make sure `SESSION_SECRET` is set to a strong random value
- Clear browser cookies and try again

### Database connection errors
- Verify database exists: `CREATE DATABASE repawblic;`
- Check MySQL user permissions
- Confirm `DB_HOST`, `DB_USER`, and `DB_PASSWORD` are correct

## Migration from Hardcoded Values

The following hardcoded values have been moved to environment variables:

1. ✅ **Session Secret**: Changed from `"yourSecretKey123"` to `process.env.SESSION_SECRET`
2. ✅ **Port**: Changed from `3000` to `process.env.PORT || 3000`
3. ✅ **Database Credentials**: Already using environment variables

## Need Help?

If you encounter any issues, check:
1. `.env` file exists in the root directory
2. All required variables are set
3. No syntax errors in `.env` file
4. Database server is running
