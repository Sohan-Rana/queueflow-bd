"""WebSocket hub — প্রতিটি সার্ভিসের জন্য একটি "রুম"। কিউ বদলালেই সবাইকে নতুন snapshot যায়।"""
import asyncio
from collections import defaultdict

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, ws: WebSocket, service_id: int) -> None:
        await ws.accept()
        self.rooms[service_id].add(ws)

    def disconnect(self, ws: WebSocket, service_id: int) -> None:
        self.rooms[service_id].discard(ws)

    async def _broadcast(self, service_id: int, data: dict) -> None:
        for ws in list(self.rooms.get(service_id, ())):
            try:
                await ws.send_json(data)
            except Exception:
                self.rooms[service_id].discard(ws)

    def publish(self, service_id: int, data: dict) -> None:
        """sync endpoint (thread) থেকেও নিরাপদে ডাকা যায়।"""
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._broadcast(service_id, data), self.loop)


hub = Hub()
