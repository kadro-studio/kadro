<?php
// Server-side checks of uploaded files. The app validates too, but anything
// stored here is served to every user, so nothing is trusted.

if (!defined('ABSPATH')) {
	exit;
}

/**
 * Validates an upload for its kind. Returns null when fine, otherwise a message.
 */
function kw_validate_file(string $kind, string $data): ?string {
	if ($data === '' || strlen($data) > KW_MAX_BYTES[$kind]) {
		return 'File is empty or too large';
	}
	if (!mb_check_encoding($data, 'UTF-8')) {
		return 'File must be UTF-8 text';
	}
	switch ($kind) {
		case 'effect':
		case 'transition':
		case 'element':
			return kw_validate_mod($kind, $data);
		case 'lut':
			return kw_validate_cube($data);
		default:
			return kw_validate_item($kind, $data);
	}
}

/** .vrmod: the same rules as the app's validateFxDef. */
function kw_validate_mod(string $kind, string $data): ?string {
	$d = json_decode($data, true);
	if (!is_array($d)) {
		return 'Not a JSON mod';
	}
	$expected = $kind === 'element' ? 'generator' : $kind;
	if (($d['kind'] ?? '') !== $expected) {
		return 'Mod kind does not match';
	}
	if (!is_string($d['id'] ?? null) || !preg_match('/^[a-z0-9][a-z0-9._-]{1,63}$/i', $d['id'])) {
		return 'Invalid mod id';
	}
	if (!is_string($d['name'] ?? null) || trim($d['name']) === '') {
		return 'Missing name';
	}
	$glsl = $d['glsl'] ?? null;
	if (!is_string($glsl) || strlen($glsl) > 64000) {
		return 'Missing or too large glsl';
	}
	$fn = ['effect' => 'effect', 'transition' => 'transition', 'generator' => 'generate'][$expected];
	if (!preg_match('/vec4\s+' . $fn . '\s*\(\s*vec2\s+\w+\s*\)/', $glsl)) {
		return "glsl must define vec4 $fn(vec2 uv)";
	}
	if (preg_match('/#\s*(version|extension)/', $glsl)) {
		return '#version/#extension are not allowed';
	}
	$params = $d['params'] ?? [];
	if (!is_array($params) || count($params) > 8) {
		return 'At most 8 params';
	}
	foreach ($params as $p) {
		if (!is_array($p) || !is_string($p['id'] ?? null) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,31}$/', $p['id'])) {
			return 'Invalid param id';
		}
		foreach (['min', 'max', 'default'] as $k) {
			if (!is_int($p[$k] ?? null) && !is_float($p[$k] ?? null)) {
				return 'Invalid param range';
			}
		}
	}
	return null;
}

/** .cube 3D LUT: size header and exactly size³ RGB rows. */
function kw_validate_cube(string $data): ?string {
	if (!preg_match('/^\s*LUT_3D_SIZE\s+(\d+)\s*$/mi', $data, $m)) {
		return 'Missing LUT_3D_SIZE';
	}
	$size = (int) $m[1];
	if ($size < 2 || $size > 65) {
		return 'LUT size must be 2..65';
	}
	$rows = preg_match_all('/^\s*[-+]?[\d.]+(?:e[-+]?\d+)?\s+[-+]?[\d.]+(?:e[-+]?\d+)?\s+[-+]?[\d.]+(?:e[-+]?\d+)?\s*$/mi', $data);
	if ($rows !== $size * $size * $size) {
		return 'LUT has the wrong number of entries';
	}
	return null;
}

/** .kadroitem JSON for looks, title styles, themes and project templates. */
function kw_validate_item(string $kind, string $data): ?string {
	$d = json_decode($data, true);
	if (!is_array($d) || ($d['format'] ?? 0) !== 1 || ($d['kind'] ?? '') !== $kind || !is_array($d['data'] ?? null)) {
		return 'Not a Kadro item of this kind';
	}
	$v = $d['data'];
	if ($kind === 'look' && (!is_array($v['adjust'] ?? null) || !is_array($v['effects'] ?? null))) {
		return 'Invalid filter';
	}
	if ($kind === 'look' && isset($d['lutCube']) && (!is_string($d['lutCube']) || kw_validate_cube($d['lutCube']) !== null)) {
		return 'Invalid LUT inside the filter';
	}
	if ($kind === 'textStyle' && !is_array($v['style'] ?? null)) {
		return 'Invalid title style';
	}
	if ($kind === 'theme' && (!is_string($v['accent'] ?? null) || !preg_match('/^#[0-9a-f]{6}$/i', $v['accent']))) {
		return 'Invalid theme';
	}
	if ($kind === 'template') {
		return kw_validate_template($v);
	}
	return null;
}

/**
 * A project template: a timeline whose media are empty slots (never paths to the
 * author's files), with the mods and LUTs it uses.
 */
function kw_validate_template(array $v): ?string {
	$p = $v['project'] ?? null;
	if (!is_array($p) || !is_array($p['tracks'] ?? null) || !is_array($p['media'] ?? null) || !is_array($p['settings'] ?? null)) {
		return 'Invalid template project';
	}
	$w = $p['settings']['width'] ?? 0;
	$h = $p['settings']['height'] ?? 0;
	if (!is_int($w) || !is_int($h) || $w < 16 || $h < 16 || $w > 8192 || $h > 8192) {
		return 'Invalid frame size';
	}
	if (count($p['media']) > 200 || count($p['tracks']) > 100) {
		return 'Template is too large';
	}
	foreach ($p['media'] as $m) {
		if (!is_array($m) || ($m['path'] ?? '') !== '' || !is_array($m['slot'] ?? null)) {
			return 'Template media must be empty slots';
		}
	}
	foreach ($p['fx'] ?? [] as $fx) {
		$kind = is_array($fx) && ($fx['kind'] ?? '') === 'generator' ? 'element' : ($fx['kind'] ?? '');
		if (!in_array($kind, ['effect', 'transition', 'element'], true) || kw_validate_mod($kind, wp_json_encode($fx)) !== null) {
			return 'Invalid effect inside the template';
		}
	}
	foreach ($v['luts'] ?? [] as $lut) {
		if (!is_array($lut) || !is_string($lut['cube'] ?? null) || kw_validate_cube($lut['cube']) !== null) {
			return 'Invalid LUT inside the template';
		}
	}
	return null;
}

/** Preview image: JPEG or PNG, sane size. */
function kw_validate_preview(string $path): ?string {
	if (filesize($path) > 1572864) {
		return 'Preview is too large';
	}
	$info = @getimagesize($path);
	if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true) || $info[0] > 2048 || $info[1] > 2048) {
		return 'Preview must be a JPEG or PNG image';
	}
	return null;
}
