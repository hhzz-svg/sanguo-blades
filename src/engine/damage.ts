export interface DamageFactors {
  base: number;
  critical?: boolean;
  criticalMultiplier?: number;
  blessingBonus?: number;
  comboRankBonus?: number;
  lowHealthBonus?: number;
  skillMultiplier?: number;
}

export interface DamageResult {
  damage: number;
  guarded: boolean;
  guardBroken: boolean;
}

export function composeDamage(factors: DamageFactors): number {
  const critical = factors.critical ? (factors.criticalMultiplier ?? 1.5) : 1;
  return factors.base
    * critical
    * (1 + (factors.blessingBonus ?? 0))
    * (1 + (factors.comboRankBonus ?? 0))
    * (1 + (factors.lowHealthBonus ?? 0))
    * (factors.skillMultiplier ?? 1);
}

export function resolveGuardedDamage(
  damage: number,
  options: { shield: boolean; frontal: boolean; heavy: boolean },
): DamageResult {
  if (!options.shield) return { damage, guarded: false, guardBroken: false };
  if (options.heavy) return { damage, guarded: false, guardBroken: true };
  if (options.frontal) return { damage: damage * 0.1, guarded: true, guardBroken: false };
  return { damage, guarded: false, guardBroken: false };
}
