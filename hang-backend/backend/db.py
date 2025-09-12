# Database connection module
import psycopg2
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the parent directory to the path so we can import settings
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# import from settings.py
from backend.settings import DATABASES


class DatabaseManager:
    """
    A class to manage PostgreSQL database connections and operations
    """
    
    def __init__(self):
        self._connection = None
        self._db_config = DATABASES['default']
    
    def get_connection(self):
        """
        Get a database connection using settings from settings.py
        Returns a psycopg2 connection object
        """
        if self._connection is None or self._connection.closed:
            try:
                self._connection = psycopg2.connect(
                    host=self._db_config['HOST'],
                    database=self._db_config['NAME'],
                    user=self._db_config['USER'],
                    password=self._db_config['PASSWORD'],
                    port=self._db_config['PORT']
                )
                print("✅ Connected to PostgreSQL database")
                
            except psycopg2.Error as e:
                print(f"❌ Error connecting to PostgreSQL: {e}")
                raise e
        
        return self._connection
    
    def get_cursor(self):
        """
        Get a database cursor for executing queries
        Returns a psycopg2 cursor object
        """
        conn = self.get_connection()
        return conn.cursor()
    
    def execute_query(self, query, params=None):
        """
        Execute a query and return results
        Args:
            query (str): SQL query to execute
            params (tuple): Parameters for the query
        Returns:
            list: Query results
        """
        cursor = self.get_cursor()
        
        try:
            cursor.execute(query, params)
            
            # If it's a SELECT query, fetch results
            if query.strip().upper().startswith('SELECT'):
                results = cursor.fetchall()
                return results
            else:
                # For INSERT, UPDATE, DELETE, commit the transaction
                self.get_connection().commit()
                return cursor.rowcount
                
        except psycopg2.Error as e:
            self.get_connection().rollback()
            print(f"❌ Database error: {e}")
            raise e
        finally:
            cursor.close()
    
    def execute_many(self, query, params_list):
        """
        Execute a query multiple times with different parameters
        Args:
            query (str): SQL query to execute
            params_list (list): List of parameter tuples
        Returns:
            int: Number of affected rows
        """
        cursor = self.get_cursor()
        
        try:
            cursor.executemany(query, params_list)
            self.get_connection().commit()
            return cursor.rowcount
            
        except psycopg2.Error as e:
            self.get_connection().rollback()
            print(f"❌ Database error: {e}")
            raise e
        finally:
            cursor.close()
    
    def fetch_one(self, query, params=None):
        """
        Execute a query and return a single row
        Args:
            query (str): SQL query to execute
            params (tuple): Parameters for the query
        Returns:
            tuple: Single row result or None
        """
        cursor = self.get_cursor()
        
        try:
            cursor.execute(query, params)
            result = cursor.fetchone()
            return result
            
        except psycopg2.Error as e:
            print(f"❌ Database error: {e}")
            raise e
        finally:
            cursor.close()
    
    def fetch_all(self, query, params=None):
        """
        Execute a query and return all rows
        Args:
            query (str): SQL query to execute
            params (tuple): Parameters for the query
        Returns:
            list: All rows
        """
        cursor = self.get_cursor()
        
        try:
            cursor.execute(query, params)
            results = cursor.fetchall()
            return results
            
        except psycopg2.Error as e:
            print(f"❌ Database error: {e}")
            raise e
        finally:
            cursor.close()
    
    def test_connection(self):
        """
        Test the database connection
        Returns:
            bool: True if connection successful, False otherwise
        """
        try:
            cursor = self.get_cursor()
            cursor.execute("SELECT version();")
            version = cursor.fetchone()
            print(f"PostgreSQL version: {version[0]}")
            cursor.close()
            return True
        except Exception as e:
            print(f"❌ Connection test failed: {e}")
            return False
    
    def close_connection(self):
        """
        Close the database connection
        """
        if self._connection and not self._connection.closed:
            self._connection.close()
            print("🔒 Database connection closed.")
            self._connection = None
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close_connection()
    
    def __del__(self):
        """Destructor to ensure connection is closed"""
        self.close_connection()


# Create a global instance for easy access
db = DatabaseManager()

# Convenience functions for backward compatibility
def get_db_connection():
    """Get database connection (backward compatibility)"""
    return db.get_connection()

def get_db_cursor():
    """Get database cursor (backward compatibility)"""
    return db.get_cursor()

def execute_query(query, params=None):
    """Execute query (backward compatibility)"""
    return db.execute_query(query, params)

def close_db_connection():
    """Close database connection (backward compatibility)"""
    return db.close_connection()

def test_connection():
    """Test database connection (backward compatibility)"""
    return db.test_connection()

def clear_database():
    """
    Clear all data from the database.
    WARNING: This will permanently delete ALL data in the database!
    Use with caution and only in development environments.
    """
    import django
    import os
    import sys
    
    # Add the project directory to Python path
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_dir not in sys.path:
        sys.path.insert(0, project_dir)
    
    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()
    
    from django.contrib.auth import get_user_model
    from notes.models import Document, Folder, Tag, Image
    from rest_framework.authtoken.models import Token
    
    print("🗑️  Starting database cleanup...")
    print("⚠️  WARNING: This will delete ALL data in the database!")
    
    # Ask for confirmation
    confirm = input("Are you sure you want to proceed? Type 'DELETE ALL DATA' to confirm: ")
    if confirm != "DELETE ALL DATA":
        print("❌ Operation cancelled.")
        return False
    
    try:
        from django.db import connection
        
        # Get the User model
        User = get_user_model()
        
        # Check which tables exist
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            """)
            existing_tables = [row[0] for row in cursor.fetchall()]
        
        print(f"\n📊 Found tables: {', '.join(existing_tables)}")
        
        # Count existing data using raw SQL to avoid schema mismatch issues
        user_count = 0
        document_count = 0
        folder_count = 0
        tag_count = 0
        image_count = 0
        token_count = 0
        
        with connection.cursor() as cursor:
            if 'accounts_user' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM accounts_user")
                user_count = cursor.fetchone()[0]
            
            if 'notes_document' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_document")
                document_count = cursor.fetchone()[0]
            
            if 'notes_folder' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_folder")
                folder_count = cursor.fetchone()[0]
            
            if 'notes_tag' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_tag")
                tag_count = cursor.fetchone()[0]
            
            if 'notes_image' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_image")
                image_count = cursor.fetchone()[0]
            
            if 'authtoken_token' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM authtoken_token")
                token_count = cursor.fetchone()[0]
        
        print(f"\n📊 Current database contents:")
        print(f"   Users: {user_count}")
        print(f"   Documents: {document_count}")
        print(f"   Folders: {folder_count}")
        print(f"   Tags: {tag_count}")
        print(f"   Images: {image_count}")
        print(f"   Auth Tokens: {token_count}")
        
        # Delete in reverse dependency order using raw SQL to avoid schema issues
        print(f"\n🗑️  Deleting data...")
        
        with connection.cursor() as cursor:
            # Delete auth tokens first (if table exists)
            if 'authtoken_token' in existing_tables:
                cursor.execute("DELETE FROM authtoken_token")
                deleted_tokens = cursor.rowcount
                print(f"   ✅ Deleted {deleted_tokens} auth tokens")
            else:
                print(f"   ⏭️  Skipped auth tokens (table doesn't exist)")
            
            # Delete images (if table exists)
            if 'notes_image' in existing_tables:
                cursor.execute("DELETE FROM notes_image")
                deleted_images = cursor.rowcount
                print(f"   ✅ Deleted {deleted_images} images")
            else:
                print(f"   ⏭️  Skipped images (table doesn't exist)")
            
            # Delete documents (if table exists)
            if 'notes_document' in existing_tables:
                cursor.execute("DELETE FROM notes_document")
                deleted_documents = cursor.rowcount
                print(f"   ✅ Deleted {deleted_documents} documents")
            else:
                print(f"   ⏭️  Skipped documents (table doesn't exist)")
            
            # Delete folders (if table exists)
            if 'notes_folder' in existing_tables:
                cursor.execute("DELETE FROM notes_folder")
                deleted_folders = cursor.rowcount
                print(f"   ✅ Deleted {deleted_folders} folders")
            else:
                print(f"   ⏭️  Skipped folders (table doesn't exist)")
            
            # Delete tags (if table exists)
            if 'notes_tag' in existing_tables:
                cursor.execute("DELETE FROM notes_tag")
                deleted_tags = cursor.rowcount
                print(f"   ✅ Deleted {deleted_tags} tags")
            else:
                print(f"   ⏭️  Skipped tags (table doesn't exist)")
            
            # Delete users (if table exists)
            if 'accounts_user' in existing_tables:
                cursor.execute("DELETE FROM accounts_user")
                deleted_users = cursor.rowcount
                print(f"   ✅ Deleted {deleted_users} users")
            else:
                print(f"   ⏭️  Skipped users (table doesn't exist)")
        
        print(f"\n🎉 Database cleanup completed successfully!")
        print(f"   All data has been removed from the database.")
        
        # Verify cleanup using raw SQL
        remaining_users = 0
        remaining_documents = 0
        remaining_folders = 0
        remaining_tags = 0
        remaining_images = 0
        remaining_tokens = 0
        
        with connection.cursor() as cursor:
            if 'accounts_user' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM accounts_user")
                remaining_users = cursor.fetchone()[0]
            
            if 'notes_document' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_document")
                remaining_documents = cursor.fetchone()[0]
            
            if 'notes_folder' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_folder")
                remaining_folders = cursor.fetchone()[0]
            
            if 'notes_tag' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_tag")
                remaining_tags = cursor.fetchone()[0]
            
            if 'notes_image' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM notes_image")
                remaining_images = cursor.fetchone()[0]
            
            if 'authtoken_token' in existing_tables:
                cursor.execute("SELECT COUNT(*) FROM authtoken_token")
                remaining_tokens = cursor.fetchone()[0]
        
        print(f"\n📊 Verification - remaining data:")
        print(f"   Users: {remaining_users}")
        print(f"   Documents: {remaining_documents}")
        print(f"   Folders: {remaining_folders}")
        print(f"   Tags: {remaining_tags}")
        print(f"   Images: {remaining_images}")
        print(f"   Auth Tokens: {remaining_tokens}")
        
        if all(count == 0 for count in [remaining_users, remaining_documents, remaining_folders, remaining_tags, remaining_images, remaining_tokens]):
            print(f"\n✅ Database is completely clean!")
        else:
            print(f"\n⚠️  Some data may still remain. Check the counts above.")
            
        return True
            
    except Exception as e:
        print(f"\n❌ Error during database cleanup: {e}")
        print(f"   Please check your database connection and try again.")
        return False

def clear_database_force():
    """
    Clear all data from the database without confirmation.
    WARNING: This will permanently delete ALL data in the database!
    Use with extreme caution and only in development environments.
    """
    import django
    import os
    import sys
    
    # Add the project directory to Python path
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_dir not in sys.path:
        sys.path.insert(0, project_dir)
    
    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()
    
    from django.contrib.auth import get_user_model
    from notes.models import Document, Folder, Tag, Image
    from rest_framework.authtoken.models import Token
    
    print("🗑️  Force clearing database...")
    print("⚠️  WARNING: This will delete ALL data without confirmation!")
    
    try:
        from django.db import connection
        
        # Get the User model
        User = get_user_model()
        
        # Check which tables exist
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            """)
            existing_tables = [row[0] for row in cursor.fetchall()]
        
        print(f"🗑️  Deleting all data from existing tables...")
        
        with connection.cursor() as cursor:
            # Delete in reverse dependency order using raw SQL
            if 'authtoken_token' in existing_tables:
                cursor.execute("DELETE FROM authtoken_token")
                print(f"   ✅ Deleted all auth tokens")
            else:
                print(f"   ⏭️  Skipped auth tokens (table doesn't exist)")
            
            if 'notes_image' in existing_tables:
                cursor.execute("DELETE FROM notes_image")
                print(f"   ✅ Deleted all images")
            else:
                print(f"   ⏭️  Skipped images (table doesn't exist)")
            
            if 'notes_document' in existing_tables:
                cursor.execute("DELETE FROM notes_document")
                print(f"   ✅ Deleted all documents")
            else:
                print(f"   ⏭️  Skipped documents (table doesn't exist)")
            
            if 'notes_folder' in existing_tables:
                cursor.execute("DELETE FROM notes_folder")
                print(f"   ✅ Deleted all folders")
            else:
                print(f"   ⏭️  Skipped folders (table doesn't exist)")
            
            if 'notes_tag' in existing_tables:
                cursor.execute("DELETE FROM notes_tag")
                print(f"   ✅ Deleted all tags")
            else:
                print(f"   ⏭️  Skipped tags (table doesn't exist)")
            
            if 'accounts_user' in existing_tables:
                cursor.execute("DELETE FROM accounts_user")
                print(f"   ✅ Deleted all users")
            else:
                print(f"   ⏭️  Skipped users (table doesn't exist)")
        
        print(f"\n🎉 Database force cleanup completed!")
        return True
            
    except Exception as e:
        print(f"\n❌ Error during database cleanup: {e}")
        return False

def clear_migration_history():
    """
    Clear Django migration history from the database.
    This is useful when you need to reset migrations completely.
    """
    import django
    import os
    import sys
    
    # Add the project directory to Python path
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_dir not in sys.path:
        sys.path.insert(0, project_dir)
    
    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()
    
    from django.db import connection
    
    print("🗑️  Clearing Django migration history...")
    print("⚠️  WARNING: This will remove all migration records from the database!")
    
    try:
        with connection.cursor() as cursor:
            # Check if django_migrations table exists
            cursor.execute("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'django_migrations'
            """)
            
            if cursor.fetchone():
                # Clear migration history
                cursor.execute("DELETE FROM django_migrations")
                deleted_count = cursor.rowcount
                print(f"   ✅ Deleted {deleted_count} migration records")
            else:
                print(f"   ⏭️  No migration history found")
        
        print(f"\n🎉 Migration history cleared!")
        print(f"   You can now run: python3 manage.py migrate --fake-initial")
        return True
            
    except Exception as e:
        print(f"\n❌ Error clearing migration history: {e}")
        return False

def drop_all_tables():
    """
    Drop all tables in the database.
    This is the nuclear option - use with extreme caution!
    """
    import django
    import os
    import sys
    
    # Add the project directory to Python path
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_dir not in sys.path:
        sys.path.insert(0, project_dir)
    
    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()
    
    from django.db import connection
    
    print("💥 DROPPING ALL TABLES...")
    print("⚠️  WARNING: This will permanently delete ALL tables and data!")
    print("⚠️  This is the nuclear option - use with extreme caution!")
    
    confirm = input("Type 'DROP ALL TABLES' to confirm: ")
    if confirm != "DROP ALL TABLES":
        print("❌ Operation cancelled.")
        return False
    
    try:
        with connection.cursor() as cursor:
            # Get all table names
            cursor.execute("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            """)
            tables = [row[0] for row in cursor.fetchall()]
            
            if not tables:
                print("   ⏭️  No tables found to drop")
                return True
            
            print(f"   Found {len(tables)} tables to drop: {', '.join(tables)}")
            
            # Drop all tables
            for table in tables:
                cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
                print(f"   ✅ Dropped table: {table}")
        
        print(f"\n💥 All tables dropped successfully!")
        print(f"   Database is now completely empty.")
        print(f"   You can now run: python3 manage.py migrate")
        return True
            
    except Exception as e:
        print(f"\n❌ Error dropping tables: {e}")
        return False


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "clear":
        # Test the connection when run directly
        with DatabaseManager() as db_manager:
            db_manager.test_connection()
        
        # Clear database if requested
        if len(sys.argv) > 2 and sys.argv[2] == "--force":
            clear_database_force()
        else:
            clear_database()
    elif len(sys.argv) > 1 and sys.argv[1] == "clear-migrations":
        # Clear migration history
        clear_migration_history()
    elif len(sys.argv) > 1 and sys.argv[1] == "drop-tables":
        # Drop all tables (nuclear option)
        drop_all_tables()
    else:
        # Test the connection when run directly
        with DatabaseManager() as db_manager:
            db_manager.test_connection()