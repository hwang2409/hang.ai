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


if __name__ == "__main__":
    # Test the connection when run directly
    with DatabaseManager() as db_manager:
        db_manager.test_connection()