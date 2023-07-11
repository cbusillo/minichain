import hashlib
import os
import pickle


class DiskCache:
    def __init__(self, cache_dir="./.cache"):
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)

    @staticmethod
    def _hash_string(string):
        return hashlib.sha256(string.encode("utf-8")).hexdigest()

    def _get_cache_path(self, key):
        return os.path.join(self.cache_dir, f"{self._hash_string(key)}.pkl")

    def load_from_cache(self, key):
        cache_path = self._get_cache_path(key)
        try:
            with open(cache_path, "rb") as cache_file:
                return pickle.load(cache_file)
        except FileNotFoundError:
            return None

    def save_to_cache(self, key, value):
        cache_path = self._get_cache_path(key)
        with open(cache_path, "wb") as cache_file:
            pickle.dump(value, cache_file)

    def cache(self, func):
        def wrapper(*args, **kwargs):
            key = str(repr({"args": args, "kwargs": kwargs, "f": func.__name__}))
            cached_value = self.load_from_cache(key)
            if cached_value is not None:
                return cached_value
            else:
                result = func(*args, **kwargs)
                self.save_to_cache(key, result)
                return result

        return wrapper

    def invalidate(self, func, *args, **kwargs):
        key = str(repr({"args": args, "kwargs": kwargs, "f": func.__name__}))
        cache_path = self._get_cache_path(key)
        os.remove(cache_path)

    def __call__(self, func):
        return self.cache(func)


disk_cache = DiskCache()
