export const inspected = (mileage = 0) => ({
  mileage,
  ...Object.fromEntries(
    ['body', 'electrical', 'suspension', 'tires', 'brakes', 'engine'].map((key) => [
      key,
      { state: 'S/A', observation: '' },
    ]),
  ),
});
