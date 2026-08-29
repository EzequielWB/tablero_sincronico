with open('E:/PROYECTO_PAG_TABLERO/index.html', 'r', encoding='utf8') as f:
    lines = f.readlines()

# Filtrar líneas: mantener líneas que NO sean la función prepararArrastre ni crearMolde
# y también remover el listener pointerdown viejo.
new_lines = []
skip = False
for i, line in enumerate(lines):
    # Saltar la función prepararArrastre
    if 'function prepararArrastre' in line:
        skip = True
        continue
    # Saltar hasta después de crearMolde
    if skip:
        # Marcar fin de skip al encontrar la siguiente función (ocultarDetalles o similar)
        if 'function ocultarDetalles' in line or (line.strip().startswith('function ') and 'crearMolde' not in line):
            skip = False
        # Si aún estamos en skip, no incluimos la línea
        continue
    # También remover el listener pointerdown viejo si está suelto
    if 'lienzo.addEventListener("pointerdown", prepararArrastre)' in line:
        # Lo remplazamos por click
        new_lines.append('    lienzo.addEventListener("click", prepararClick);\n')
        continue
    new_lines.append(line)

with open('E:/PROYECTO_PAG_TABLERO/index.html', 'w', encoding='utf8') as f:
    f.writelines(new_lines)
print('Listo')