# Hang.ai - Your Thoughts, Organized

A modern note-taking application built with Next.js and Django REST Framework.

## Features

- 📝 Rich text editing with Markdown support
- 🧮 LaTeX math rendering
- 🖼️ Drag-and-drop image uploads
- 📁 Folder organization with nesting
- 🏷️ Tag system
- 🔍 Search functionality
- 🗑️ Trash system with restore
- 👤 User authentication
- 📱 Responsive design

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Django 3.2, Django REST Framework
- **Database**: PostgreSQL
- **Editor**: CodeMirror 6
- **Math Rendering**: KaTeX
- **PDF Export**: jsPDF, html2canvas

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/hang-ai.git
   cd hang-ai
   ```

2. **Backend Setup**
   ```bash
   cd hang-backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   
   # Create .env file with database credentials
   cp .env.example .env
   # Edit .env with your database settings
   
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```

3. **Frontend Setup**
   ```bash
   cd hang-frontend
   npm install
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000/api
   - Admin: http://localhost:8000/admin

## Deployment

For production deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

Quick deployment with our script:
```bash
./deploy.sh
```

## Project Structure

```
hang-ai/
├── hang-frontend/          # Next.js frontend
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── components/    # React components
│   │   └── contexts/      # React contexts
│   └── vercel.json        # Vercel configuration
├── hang-backend/          # Django backend
│   ├── backend/           # Django project settings
│   ├── notes/             # Notes app
│   ├── accounts/          # User authentication
│   └── requirements.txt   # Python dependencies
└── DEPLOYMENT.md          # Deployment guide
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the deployment guide for common problems
- Review the Django and Next.js documentation

---

Built with ❤️ for better note-taking