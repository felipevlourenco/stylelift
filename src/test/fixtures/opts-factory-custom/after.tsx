import { View } from 'react-native';
import { createStyles } from './theme';

export const A = () => <View style={styles.container} />;

const styles = createStyles({
  container: {
    margin: 4,
  },
});
