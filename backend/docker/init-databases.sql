SELECT 'CREATE DATABASE synapta_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'synapta_test')\gexec
