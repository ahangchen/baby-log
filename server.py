#!/usr/bin/env python3
"""Baby Log server: static files + simple JSON event API."""
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE, 'data', 'events.json')
LOCK = threading.Lock()
os.makedirs(os.path.join(BASE, 'data'), exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w') as f:
        f.write('[]')


def load_events():
    with open(DATA_FILE) as f:
        return json.load(f)


def save_events(events):
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(events, f, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


class Handler(SimpleHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/events':
            with LOCK:
                events = load_events()
            return self._json(200, events)
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/events':
            return self._json(404, {'error': 'not found'})
        length = int(self.headers.get('Content-Length', 0))
        try:
            event = json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return self._json(400, {'error': 'bad json'})
        with LOCK:
            events = load_events()
            events.append(event)
            save_events(events)
        return self._json(200, {'ok': True, 'id': event.get('id')})

    def do_PUT(self):
        if not self.path.startswith('/api/events/'):
            return self._json(404, {'error': 'not found'})
        try:
            eid = int(self.path.rsplit('/', 1)[1])
        except ValueError:
            return self._json(400, {'error': 'bad id'})
        length = int(self.headers.get('Content-Length', 0))
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return self._json(400, {'error': 'bad json'})
        data.pop('id', None)
        with LOCK:
            events = load_events()
            for i, e in enumerate(events):
                if e.get('id') == eid:
                    events[i].update(data)
                    save_events(events)
                    return self._json(200, {'ok': True})
        return self._json(404, {'error': 'event not found'})

    def do_DELETE(self):
        if self.path.startswith('/api/events/'):
            try:
                eid = int(self.path.rsplit('/', 1)[1])
            except ValueError:
                return self._json(400, {'error': 'bad id'})
            with LOCK:
                events = load_events()
                remaining = [e for e in events if e.get('id') != eid]
                save_events(remaining)
            return self._json(200, {'ok': True, 'removed': len(events) - len(remaining)})
        return self._json(404, {'error': 'not found'})

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
