output "lambda_function_name" {
  value = aws_lambda_function.pdf_lambda.function_name
}

output "s3_bucket_name" {
  value = aws_s3_bucket.pdf_bucket.bucket
}
