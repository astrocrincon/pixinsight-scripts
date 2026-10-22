#!/usr/bin/env python3
"""Prepara un ZIP y un updates.xri sin firmar, sin publicarlos ni usar claves."""

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_SUFFIXES = {".xssk", ".pem", ".key"}


def collect_files(config, source):
    """Lista explícita de archivos; añade las firmas de los puntos de entrada."""
    files = config.get("files")
    entries = config.get("entrypoints")
    if not isinstance(files, list) or not files:
        raise ValueError("files debe ser una lista no vacía.")
    if not isinstance(entries, list) or not entries:
        raise ValueError("entrypoints debe indicar los scripts que se firman.")
    if not all(isinstance(p, str) for p in files + entries):
        raise ValueError("Las rutas deben ser cadenas de texto.")
    if len(set(files)) != len(files):
        raise ValueError("Hay rutas repetidas en files.")
    if not set(entries).issubset(files):
        raise ValueError("Cada entrypoint debe figurar también en files.")
    names = set(files)
    for name in entries:
        if not name.endswith(".js"):
            raise ValueError("Los entrypoints deben tener extensión .js.")
        names.add(str(PurePosixPath(name).with_suffix(".xsgn")))
    result = []
    folded = set()
    for name in sorted(names):
        relative = PurePosixPath(name)
        if (relative.is_absolute() or ".." in relative.parts or "\\" in name
                or ":" in name or str(relative) != name
                or not name.startswith("scripts/crinconlab/")):
            raise ValueError("Ruta de instalación no válida: " + name)
        if any(part.startswith(".") for part in relative.parts):
            raise ValueError("No se empaquetan archivos ocultos: " + name)
        if relative.suffix.lower() in PRIVATE_SUFFIXES:
            raise ValueError("No se empaquetan claves privadas: " + name)
        if name.casefold() in folded:
            raise ValueError("Rutas incompatibles en sistemas sin distinción de mayúsculas.")
        folded.add(name.casefold())
        path = source.joinpath(*relative.parts)
        if any(p.is_symlink() for p in [path, *path.parents]):
            raise ValueError("No se admiten enlaces simbólicos: " + name)
        if not path.is_file() or not path.stat().st_size:
            raise ValueError("Falta un archivo o está vacío: " + name)
        if name in entries and not re.search(
                r"^\s*#feature-id\s+\S+", path.read_text(encoding="utf-8"), re.M):
            raise ValueError("El script no declara #feature-id: " + name)
        result.append((path, "src/" + name))
    return result


def build(config, source, output, release_date):
    for key in ("package_id", "version", "title", "description", "pixinsight_versions"):
        if not isinstance(config.get(key), str) or not config[key].strip():
            raise ValueError("Completa el campo " + key + " antes de empaquetar.")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", config["package_id"]):
        raise ValueError("package_id solo admite minúsculas, números y guiones.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", config["version"]):
        raise ValueError("version no puede contener espacios ni rutas.")
    if not re.fullmatch(r"\d+\.\d+\.\d+:\d+\.\d+\.\d+", config["pixinsight_versions"]):
        raise ValueError("Indica el rango comprobado: mínimo:máximo, por ejemplo 1.9.3:1.9.4.")
    low, high = (tuple(map(int, v.split("."))) for v in config["pixinsight_versions"].split(":"))
    if low > high:
        raise ValueError("El mínimo de PixInsight no puede superar al máximo.")
    files = collect_files(config, source)
    # No se utilizan fechas de modificación para validar firmas: Git las cambia.
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="release-", dir=output) as work:
        work = Path(work)
        archive = work / "package.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for path, target in files:
                info = zipfile.ZipInfo(target, date_time=(2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                bundle.writestr(info, path.read_bytes())
        data = archive.read_bytes()
        sha1 = hashlib.sha1(data).hexdigest()
        sha256 = hashlib.sha256(data).hexdigest()
        filename = config["package_id"] + "-" + config["version"] + "-" + sha256[:16] + ".zip"
        destination = output / (config["package_id"] + "-" + config["version"] + "-" + sha256[:16])
        if destination.exists():
            raise ValueError("Este paquete ya existe; no se sobrescribe: " + str(destination))
        archive.rename(work / filename)
        root = ET.Element("xri", version="1.0")
        ET.SubElement(ET.SubElement(root, "description"), "p").text = "PixInsight scripts — crinconlab"
        platform = ET.SubElement(root, "platform", os="all", arch="noarch", version=config["pixinsight_versions"])
        package = ET.SubElement(platform, "package", fileName=filename, sha1=sha1,
                                type="script", releaseDate=release_date.strftime("%Y%m%d"))
        ET.SubElement(package, "title").text = config["title"] + " " + config["version"]
        ET.SubElement(ET.SubElement(package, "description"), "p").text = config["description"]
        ET.indent(root, space="   ")
        ET.ElementTree(root).write(work / "updates.xri", encoding="UTF-8", xml_declaration=True)
        with zipfile.ZipFile(work / filename) as bundle:
            if bundle.testzip() is not None:
                raise ValueError("El ZIP no supera la comprobación de integridad.")
        work.rename(destination)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--release-date", required=True, help="Fecha de publicación: AAAAMMDD")
    args = parser.parse_args()
    try:
        date = dt.datetime.strptime(args.release_date, "%Y%m%d").date()
        config = json.loads(args.config.read_text(encoding="utf-8"))
        if not isinstance(config, dict):
            raise ValueError("La configuración debe ser un objeto JSON.")
        destination = build(config, ROOT / "src", ROOT / "build", date)
    except (OSError, ValueError, TypeError) as error:
        parser.exit(1, "Error: " + str(error) + "\n")
    print("Preparado en: " + str(destination))
    print("updates.xri SIN FIRMAR. Las firmas .xsgn solo se comprueban por presencia.")
    print("Valida las firmas y la instalación en PixInsight antes de publicar.")


if __name__ == "__main__":
    main()
