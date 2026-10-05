/**
 * Mat4: column-major rigid transforms used by the joint solver.
 */
import { test, assert, assertApprox } from '../harness.js';
import {
    identity, multiply, chain, translate, rotX, rotZ, rigidInverse,
    transformPoint, transformDir, rotationAngleBetween, maxAbsDiff
} from '../../src/joints/math/Mat4.js';

const close = (a, b, tol = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('identity is neutral for multiply', () => {
    const m = chain(translate(1, 2, 3), rotX(0.3), rotZ(-1.1));
    assert(maxAbsDiff(multiply(identity(), m), m) < 1e-12);
    assert(maxAbsDiff(multiply(m, identity()), m) < 1e-12);
});

test('rotZ(90°) maps x to y; rotX(90°) maps y to z', () => {
    assert(close(transformDir(rotZ(Math.PI / 2), [1, 0, 0]), [0, 1, 0]));
    assert(close(transformDir(rotX(Math.PI / 2), [0, 1, 0]), [0, 0, 1]));
});

test('multiply applies the right-hand matrix first', () => {
    // Translate then rotate: rotZ(90°)·T(1,0,0) maps origin to (0,1,0).
    const m = multiply(rotZ(Math.PI / 2), translate(1, 0, 0));
    assert(close(transformPoint(m, [0, 0, 0]), [0, 1, 0]));
});

test('rigidInverse composes to identity', () => {
    const m = chain(translate(5, -2, 7), rotX(0.7), rotZ(2.1), translate(-1, 4, 0));
    assert(maxAbsDiff(multiply(m, rigidInverse(m)), identity()) < 1e-12);
    assert(maxAbsDiff(multiply(rigidInverse(m), m), identity()) < 1e-12);
});

test('rotationAngleBetween recovers a known relative angle and is 0 for equal', () => {
    const a = rotZ(0.4);
    assertApprox(rotationAngleBetween(a, multiply(a, rotX(0.25))), 0.25, 1e-9);
    assertApprox(rotationAngleBetween(a, a), 0, 1e-7);
    assertApprox(rotationAngleBetween(identity(), rotZ(Math.PI)), Math.PI, 1e-7);
});

test('rotation preserves lengths (orthonormality)', () => {
    const m = chain(rotX(1.3), rotZ(-0.6));
    const d = transformDir(m, [3, 4, 0]);
    assertApprox(Math.hypot(...d), 5, 1e-12);
});
