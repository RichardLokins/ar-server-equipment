
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,password TEXT,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('guest','admin','engineer','user','viewer')),preferences TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,description TEXT NOT NULL,units TEXT NOT NULL CHECK(units IN ('мм','см','м')),measurements TEXT NOT NULL,validation INTEGER NOT NULL,created TEXT NOT NULL,modified TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted TEXT);
CREATE INDEX IF NOT EXISTS project_owner_modified ON projects(owner,modified DESC);
CREATE TABLE IF NOT EXISTS rooms(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_elements(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,id TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(project_id,id));
CREATE TABLE IF NOT EXISTS project_objects(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,id TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(project_id,id));
CREATE TABLE IF NOT EXISTS project_permissions(id TEXT PRIMARY KEY,token TEXT NOT NULL UNIQUE,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,mode TEXT NOT NULL CHECK(mode IN ('view','edit')),expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS permission_project ON project_permissions(project_id,expires);
CREATE TABLE IF NOT EXISTS project_snapshots(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,created TEXT NOT NULL,label TEXT NOT NULL,body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS snapshot_project ON project_snapshots(project_id,created DESC);
CREATE TABLE IF NOT EXISTS uploaded_assets(id TEXT PRIMARY KEY,format TEXT NOT NULL,size INTEGER NOT NULL,owner TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS equipment_models(id TEXT PRIMARY KEY,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS equipment_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_permissions(token TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,object_id TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS model_permission_expires ON model_permissions(expires);
PRAGMA user_version=1;

