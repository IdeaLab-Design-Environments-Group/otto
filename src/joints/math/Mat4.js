/**
 * @fileoverview Minimal 4x4 rigid-transform math for the joint solver.
 *
 * Matrices are plain 16-element arrays in COLUMN-MAJOR order (element at
 * row r, column c is m[c * 4 + r]) — the same layout as three.js
 * `Matrix4.fromArray`, so poses can be handed to the 3D preview unchanged.
 * Vectors are `[x, y, z]` arrays. Pure functions only.
 *
 * @module joints/math/Mat4
 */

/** @returns {number[]} The identity matrix. */
export function identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Matrix product a·b (apply b first, then a).
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
export function multiply(a, b) {
    const out = new Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += a[k * 4 + r] * b[c * 4 + k];
            }
            out[c * 4 + r] = sum;
        }
    }
    return out;
}

/** Multiply any number of matrices left to right: m1·m2·…·mn. */
export function chain(...ms) {
    return ms.reduce((acc, m) => multiply(acc, m));
}

/**
 * Build a rigid transform from orthonormal basis vectors and an origin.
 * @param {number[]} x - Column 0 (local x axis in parent coordinates).
 * @param {number[]} y - Column 1.
 * @param {number[]} z - Column 2.
 * @param {number[]} o - Translation.
 * @returns {number[]}
 */
export function fromBasis(x, y, z, o) {
    return [
        x[0], x[1], x[2], 0,
        y[0], y[1], y[2], 0,
        z[0], z[1], z[2], 0,
        o[0], o[1], o[2], 1
    ];
}

/** @returns {number[]} Translation matrix. */
export function translate(x, y, z) {
    return fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1], [x, y, z]);
}

/** @returns {number[]} Rotation about the x axis by `rad` (right-handed). */
export function rotX(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return fromBasis([1, 0, 0], [0, c, s], [0, -s, c], [0, 0, 0]);
}

/** @returns {number[]} Rotation about the z axis by `rad` (right-handed). */
export function rotZ(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return fromBasis([c, s, 0], [-s, c, 0], [0, 0, 1], [0, 0, 0]);
}

/**
 * Inverse of a rigid transform [R | t] → [Rᵀ | −Rᵀt]. Exact; only valid for
 * rotation + translation matrices.
 * @param {number[]} m
 * @returns {number[]}
 */
export function rigidInverse(m) {
    // Columns of Rᵀ are the rows of R; the new translation is −Rᵀt, whose
    // components are −(column_i of R)·t.
    const row0 = [m[0], m[4], m[8]];
    const row1 = [m[1], m[5], m[9]];
    const row2 = [m[2], m[6], m[10]];
    const t = [m[12], m[13], m[14]];
    const dotCol = (i) => m[i * 4] * t[0] + m[i * 4 + 1] * t[1] + m[i * 4 + 2] * t[2];
    return fromBasis(row0, row1, row2, [-dotCol(0), -dotCol(1), -dotCol(2)]);
}

/** Transform a point (w = 1). */
export function transformPoint(m, p) {
    return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
    ];
}

/** Transform a direction (w = 0). */
export function transformDir(m, d) {
    return [
        m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
        m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
        m[2] * d[0] + m[6] * d[1] + m[10] * d[2]
    ];
}

/** @returns {number[]} The translation part of m. */
export function getTranslation(m) {
    return [m[12], m[13], m[14]];
}

/** @returns {number[]} Basis column `i` (0 = x, 1 = y, 2 = z) of m. */
export function getAxis(m, i) {
    return [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]];
}

/**
 * Angle (radians) of the relative rotation between two rigid transforms:
 * acos((tr(Raᵀ·Rb) − 1) / 2), clamped for numerical safety.
 */
export function rotationAngleBetween(a, b) {
    let trace = 0;
    for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) {
            trace += a[i * 4 + k] * b[i * 4 + k];
        }
    }
    const c = Math.min(1, Math.max(-1, (trace - 1) / 2));
    return Math.acos(c);
}

/** Largest absolute element-wise difference between two matrices. */
export function maxAbsDiff(a, b) {
    let max = 0;
    for (let i = 0; i < 16; i++) {
        max = Math.max(max, Math.abs(a[i] - b[i]));
    }
    return max;
}
