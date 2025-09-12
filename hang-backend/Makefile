VENV_DIR=venv
BACKEND=hang-backend

run-server:
	python3 $(BACKEND)/manage.py makemigrations notes
	python3 $(BACKEND)/manage.py makemigrations accounts
	python3 $(BACKEND)/manage.py migrate
	python3 $(BACKEND)/manage.py runserver
