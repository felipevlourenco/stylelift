import { View, StyleSheet } from 'react-native';

export function A() {
	return (
		<View style={styles.box} />
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	box: {
		margin: 4,
	},
});
