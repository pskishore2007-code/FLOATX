"""Small file helpers that never copy a whole scientific data file into RAM."""
import hashlib


def sha256_file(path, block_size=1024 * 1024):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        while block := handle.read(block_size):
            digest.update(block)
    return digest.hexdigest()
