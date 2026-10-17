import { View, StyleSheet } from 'react-native';

export function A() {
	return (
		<View style={styles.box} />
	);
}

const styles = StyleSheet.create({
	box: {
		margin: 4,
		padding: 2,
	},
});
