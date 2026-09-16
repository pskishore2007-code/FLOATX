"""Explicit operator ingestion: python -m floatx.ingest HTTPS_GDAC_PROFILE_URL"""
import argparse
from .services.gdac import ingest_url
from .store import ProfileStore

def main():
    parser = argparse.ArgumentParser(description='Ingest a real ARGO GDAC profile NetCDF; no demo data.')
    parser.add_argument('url')
    args = parser.parse_args()
    profiles = ingest_url(args.url)
    if not profiles:
        raise SystemExit('No usable QC-filtered profiles found; existing snapshot was not changed.')
    result = ProfileStore().save(profiles)
    print(f'Loaded {len(profiles)} QC-filtered profiles; {len(result.profiles)} total. Sync: {result.last_sync}')

if __name__ == '__main__':
    main()
