import os
import shutil
from fastapi import UploadFile
from abc import ABC, abstractmethod
from .config import settings

class BaseStorageService(ABC):
    @abstractmethod
    def save(self, file: UploadFile, destination_filename: str) -> str:
        pass

    @abstractmethod
    def get(self, path: str) -> bytes:
        pass

    @abstractmethod
    def delete(self, destination_filename: str) -> None:
        pass

class FileStorageService(BaseStorageService):
    def __init__(self):
        self.storage_path = settings.STORAGE_PATH
        os.makedirs(self.storage_path, exist_ok=True)

    def save(self, file: UploadFile, destination_filename: str) -> str:
        file_path = os.path.join(self.storage_path, destination_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return file_path

    def get(self, path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    def delete(self, destination_filename: str) -> None:
        file_path = os.path.join(self.storage_path, destination_filename)
        if os.path.exists(file_path):
            os.remove(file_path)

# Dependency injection or singleton instance
storage_service = FileStorageService()
