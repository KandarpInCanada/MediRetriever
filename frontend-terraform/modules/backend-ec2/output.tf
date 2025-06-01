output "instance_id" {
  description = "ID of the backend EC2 instance"
  value       = aws_instance.backend.id
}

output "private_ip" {
  description = "Private IP address of the backend EC2 instance"
  value       = aws_instance.backend.private_ip
}

output "instance_arn" {
  description = "ARN of the backend EC2 instance"
  value       = aws_instance.backend.arn
}
