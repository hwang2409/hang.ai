VENV_DIR=venv
BACKEND=hang-backend

run-server:
	python3 manage.py makemigrations notes
	python3 manage.py makemigrations accounts
	python3 manage.py makemigrations voice
	python3 manage.py migrate
	python3 manage.py runserver
