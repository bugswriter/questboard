from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import json
import os

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- Database Setup ---
DB_FILE = "data.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS notes 
                 (id TEXT PRIMARY KEY, text TEXT, tag TEXT, assignee TEXT, date TEXT, image TEXT, x REAL, y REAL, rotation REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS tags 
                 (name TEXT PRIMARY KEY, color TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS players 
                 (name TEXT PRIMARY KEY)''')
    c.execute('''CREATE TABLE IF NOT EXISTS kv_store 
                 (key TEXT PRIMARY KEY, value TEXT)''')
    
    # Initial Data
    c.execute("SELECT count(*) FROM tags")
    if c.fetchone()[0] == 0:
        initial_tags = [
            ('Quest', '#800000'),
            ('Lore', '#006400'),
            ('Magic', '#00008B'),
            ('Smithing', '#8B4513')
        ]
        c.executemany("INSERT INTO tags VALUES (?, ?)", initial_tags)

    c.execute("SELECT count(*) FROM players")
    if c.fetchone()[0] == 0:
        initial_players = [('Anonymous',), ('Dragonborn',)]
        c.executemany("INSERT INTO players VALUES (?)", initial_players)
    
    conn.commit()
    conn.close()

init_db()

# --- Models ---
class NoteModel(BaseModel):
    id: str
    text: str
    tag: str
    assignee: str
    date: str
    image: Optional[str] = None
    x: float
    y: float
    rotation: float

class TagModel(BaseModel):
    name: str
    color: str

class PlayerModel(BaseModel):
    name: str

class LockModel(BaseModel):
    locked: bool

# --- Routes ---

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/data")
async def get_all_data():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    c.execute("SELECT * FROM notes")
    notes = [dict(row) for row in c.fetchall()]
    
    c.execute("SELECT * FROM tags")
    tags = [dict(row) for row in c.fetchall()]
    
    c.execute("SELECT * FROM players")
    players = [row['name'] for row in c.fetchall()]
    
    c.execute("SELECT value FROM kv_store WHERE key='locked'")
    row = c.fetchone()
    locked = json.loads(row['value']) if row else False
    
    conn.close()
    return {"notes": notes, "tags": tags, "players": players, "locked": locked}

@app.post("/api/notes")
async def save_note(note: NoteModel):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              (note.id, note.text, note.tag, note.assignee, note.date, note.image, note.x, note.y, note.rotation))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM notes WHERE id=?", (note_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/tags")
async def add_tag(tag: TagModel):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO tags VALUES (?, ?)", (tag.name, tag.color))
        conn.commit()
    except sqlite3.IntegrityError:
        pass # Already exists
    conn.close()
    return {"status": "ok"}

@app.delete("/api/tags/{tag_name}")
async def delete_tag(tag_name: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM tags WHERE name=?", (tag_name,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/players")
async def add_player(player: PlayerModel):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO players VALUES (?)", (player.name,))
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    conn.close()
    return {"status": "ok"}

@app.post("/api/lock")
async def set_lock(lock: LockModel):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO kv_store VALUES ('locked', ?)", (json.dumps(lock.locked),))
    conn.commit()
    conn.close()
    return {"status": "ok"}
