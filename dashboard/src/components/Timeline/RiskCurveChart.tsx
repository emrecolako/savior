import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ComputedRiskCurve } from "./ageRiskModels";

interface RiskCurveChartProps {
  curves: ComputedRiskCurve[];
}

export function RiskCurveChart({ curves }: RiskCurveChartProps) {
  const ages = Array.from({ length: 15 }, (_, i) => 20 + i * 5);

  const data = ages.map((age) => {
    const point: Record<string, number> = { age };
    for (const curve of curves) {
      const p = curve.points;
      let risk = 0;
      for (let i = 0; i < p.length - 1; i++) {
        if (age >= p[i].age && age <= p[i + 1].age) {
          const t = (age - p[i].age) / (p[i + 1].age - p[i].age);
          risk = p[i].risk + t * (p[i + 1].risk - p[i].risk);
          break;
        }
      }
      if (age >= p[p.length - 1].age) risk = p[p.length - 1].risk;
      point[curve.model.id] = Math.round(risk * 10000) / 100;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="age"
          stroke="#9ca3af"
          label={{ value: "Age", position: "insideBottom", offset: -2, fill: "#9ca3af" }}
        />
        <YAxis
          stroke="#9ca3af"
          tickFormatter={(v: number) => `${v}%`}
          label={{ value: "Cumulative Risk", angle: -90, position: "insideLeft", fill: "#9ca3af" }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
          labelStyle={{ color: "#e5e7eb" }}
          formatter={(value: number, name: string) => {
            const curve = curves.find((c) => c.model.id === name);
            return [`${value.toFixed(1)}%`, curve?.model.condition ?? name];
          }}
          labelFormatter={(age: number) => `Age ${age}`}
        />
        <Legend
          formatter={(value: string) => {
            const curve = curves.find((c) => c.model.id === value);
            return curve?.model.condition ?? value;
          }}
        />
        {curves.map((curve) => (
          <Line
            key={curve.model.id}
            type="monotone"
            dataKey={curve.model.id}
            stroke={curve.model.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
