"""Generate synthetic energy.csv based on realistic household patterns."""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

DATA_PATH = os.path.join(os.path.dirname(__file__), 'energy.csv')

def generate_energy_data(n_days=365):
    np.random.seed(42)
    base = datetime(2007, 1, 1)
    records = []

    for day in range(n_days):
        date = base + timedelta(days=day)
        month = date.month
        weekday = date.weekday()

        # Seasonal factor (summer/winter higher)
        seasonal = 1.0
        if month in [6, 7, 8]:
            seasonal = 1.35
        elif month in [12, 1, 2]:
            seasonal = 1.25
        elif month in [3, 4, 5]:
            seasonal = 0.9
        else:
            seasonal = 0.85

        # Weekend factor
        weekend = 1.15 if weekday >= 5 else 1.0

        for hour in range(24):
            # Base hourly profile
            if 0 <= hour < 6:
                base_kw = 0.45
            elif 6 <= hour < 9:
                base_kw = 1.4
            elif 9 <= hour < 12:
                base_kw = 1.2
            elif 12 <= hour < 14:
                base_kw = 1.1
            elif 14 <= hour < 18:
                base_kw = 1.0
            elif 18 <= hour < 22:
                base_kw = 1.9
            else:
                base_kw = 1.1

            noise = np.random.normal(0, 0.12)
            global_active_power = max(0.2, base_kw * seasonal * weekend + noise)

            # Submetering derived from global power with realistic ratios
            sub1 = max(0, global_active_power * 0.12 + np.random.normal(0, 0.03))  # kitchen
            sub2 = max(0, global_active_power * 0.15 + np.random.normal(0, 0.04))  # laundry
            sub3 = max(0, global_active_power * 0.55 + np.random.normal(0, 0.08))  # HVAC

            # Voltage and intensity
            voltage = 240 + np.random.normal(0, 3)
            global_intensity = global_active_power * 1000 / voltage + np.random.normal(0, 0.2)

            records.append({
                'Date': date.strftime('%Y-%m-%d'),
                'Time': f'{hour:02d}:00:00',
                'Global_active_power': round(global_active_power, 3),
                'Global_reactive_power': round(global_active_power * 0.15 + np.random.normal(0, 0.02), 3),
                'Voltage': round(voltage, 1),
                'Global_intensity': round(global_intensity, 2),
                'Sub_metering_1': round(sub1, 2),
                'Sub_metering_2': round(sub2, 2),
                'Sub_metering_3': round(sub3, 2)
            })

    df = pd.DataFrame(records)
    df.to_csv(DATA_PATH, index=False)
    print(f'Generated {len(df)} records -> {DATA_PATH}')
    return df

if __name__ == '__main__':
    if not os.path.exists(DATA_PATH):
        generate_energy_data(365)
    else:
        print(f'{DATA_PATH} already exists.')
